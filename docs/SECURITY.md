# Security precedents

This is the standing security guidance for Switchboard. **Read it before writing
or reviewing any code that touches auth, the database, service-role access,
untrusted input, file uploads, secrets, or redirects.** It exists because the
common way these apps get broken — exposed keys, open database rules, trusting
the browser for identity/moderation, users writing their own role/rank —
compounds silently until someone pokes at it.

The good news: the architecture already avoids most of that class of bug. The
rules below are how we keep it that way. Each is phrased as a precedent to
follow, with the reasoning and the one-line litmus test.

---

## 1. The database is the security boundary, not the UI

Anon and authenticated clients talk to Postgres directly through PostgREST, so
**Row-Level Security is the only thing standing between a user and everyone
else's data.** A hidden button, a client-side `if (isAdmin)`, or a check in a
server action is convenience, never protection.

- **Every table has `enable row level security`.** No exceptions, even for
  "internal" tables. A table with RLS on and no policy is deny-all — that is a
  safe default; a table with RLS off is world-readable and world-writable.
- **Policies are scoped `to authenticated`** (or a specific role), never left to
  the implicit `public`/`anon` unless the data is genuinely public (venues,
  zones, public profile fields). Test every surface *logged out*.
- **Read it back as an attacker.** For each policy ask: "as an arbitrary signed-in
  user, whose rows can I read/insert/update/delete, and can I forge a foreign
  key to reach into someone else's data?"

Litmus test: *if RLS were the only code that ran, would the data still be safe?*

### RLS is row-level. Columns are grants, and grants are fail-closed

RLS cannot restrict *columns*, so a column too sensitive to be world-readable is
withheld with a **column grant** instead:
`20260710120000_lock_sensitive_profile_columns.sql` dropped the table-level
SELECT grant on `public.profiles` and re-granted an explicit allowlist, putting
`calendar_token` and the contact columns out of reach of the API. Two rules
follow, and both have been broken:

- **A new `profiles` column is unreadable until a migration names it.** That is
  the right default and it fails in a hostile shape: a denied column fails the
  *whole* query with `permission denied for table profiles` — which names the
  table, not the column — so the app sees "no profile row", not "you may not
  read that". `appearance_theme` shipped without its grant and Settings looked
  like it was ignoring the theme you picked; `legal_terms_version` shipped
  without its grant and the proxy quietly stopped funnelling half-registered
  accounts into onboarding. `src/lib/profile-column-grants.test.ts` now fails on
  a column that is neither granted nor documented as withheld.
- **Nothing downstream may hand the grant back.** `supabase/seed.sql` (local and
  CI only) used to run `grant select on all tables in schema public to anon,
  authenticated`, which restored precisely the table-level grant that fix
  removed — a table privilege covers every column, so the allowlist stopped
  meaning anything. For as long as that stood, the pgTAP tests asserting these
  columns were withheld could not have failed, and every local and CI run was
  against a database strictly more permissive than production. The seed now
  grants SELECT table by table, skipping `profiles`.
  `supabase/tests/profile_column_grants.test.sql` asserts
  `not has_table_privilege('authenticated', 'public.profiles', 'SELECT')`. The
  withheld-column checks catch a restored table grant too; what the table-level
  assertion adds is that it names the cause, rather than reporting that four
  unrelated columns all became readable at once. The *positive* per-column
  checks are the ones that pass either way, since a table-wide grant satisfies
  them.

Note when writing either: `REVOKE SELECT ON <table>` also drops that table's
column-level SELECT grants, so "grant broadly, then revoke the one table" leaves
nothing readable. Grant narrowly instead.

## 2. UPDATE policies need `WITH CHECK`, and ownership columns are immutable

An UPDATE policy written with only `USING` silently reuses `USING` as its check.
That gates **which rows** you may update but not **what they may become**, and
RLS can never compare OLD vs NEW — so a policy alone cannot stop a user from
repointing an ownership foreign key. This was the root cause of the worst finding
in the July 2026 sweep (F1: an addressee could repoint `connections.requester_id`
to forge an accepted connection to any victim).

Precedent:

- Give every UPDATE policy an explicit `WITH CHECK`.
- Freeze ownership/party columns (`host_id`, `requester_id`/`addressee_id`,
  `created_by`, `owner_id`, `user_id`) with a `BEFORE UPDATE` trigger that raises
  if the column changes. See the `freeze_*` triggers in
  `20260712120000_authz_hardening.sql` for the pattern.

Litmus test: *can the caller change who owns this row, or point it at a
different user?*

## 3. No authority state on a self-writable row

RLS restricts rows, not columns. `profiles_update` is `id = auth.uid()`, so a
user can write **every column of their own profile**. That is fine today only
because `profiles` has no authority column — no `role`, `is_admin`, `rank`,
`credits`, `balance`, `verified`, `subscription_tier`. Keep it that way.

- Roles, ranks, credits, balances, ban/verification status, subscription tier
  **must not live on a row the subject can UPDATE.** Put them in a table the user
  cannot write (managed only by service-role/security-definer code), or protect
  the specific columns with a `REVOKE UPDATE` / freeze trigger.
- Board membership role and event host/co-host powers already follow this: they
  live in separate tables gated by `is_board_moderator` / `is_event_host`, and
  role changes go through security-definer functions.
- `authz_hardening.test.sql` has a tripwire that fails CI if an authority-like
  column ever appears on `profiles`. If you trip it, add write protection in the
  same migration — don't just extend the tripwire's allowlist.

Litmus test: *does anything a user shouldn't grant themselves live somewhere they
can write?*

## 4. Identity and moderation are backend-enforced, never client-trusted

Identity is the authenticated Supabase session (`auth.getUser()` / `auth.uid()`).
Never derive identity, roles, or "am I allowed" from `localStorage`, a device id,
a cookie value you set yourself, or a request body field.

- Blocks, reports, and avoids are enforced in the database: `profile_blocks` /
  `user_reports` / `profile_avoids` are owner-scoped by RLS, and `are_blocked()`
  is consulted on discovery, matching, connection requests, mutual intents, and
  facet sharing. A moderation decision that only hides a button is not enforced.
- `localStorage` is fine for **preferences** (a dismissed nudge, a UI toggle),
  never for **authorization**.

Litmus test: *if the user forged the client state / called the server action
directly, would the block/ban/role still hold?*

## 5. The service-role client bypasses RLS — it must re-authorize every time

`createAdminClient()` (`src/lib/supabase/admin.ts`) is the service-role key: it
bypasses all RLS. It is **server-only** — import it only from route handlers,
server actions, and cron/runners, never from client components, and never expose
the key as `NEXT_PUBLIC_*`.

Every service-role read/write must establish **who** the caller is
(`getUser()`), and prove they are allowed to touch **this specific resource**,
by one of:

- an ownership/host check (`canManageEvent`, `is_event_host`, `ownOpenMoment`);
- possession of an unguessable token that scopes the data (guest RSVP token,
  `calendar_token`);
- routing the write through a `SECURITY DEFINER` function that itself checks
  `auth.uid()`.

When calling a definer helper with the admin client, pass the authenticated id
explicitly (`is_event_host(p_event, userId)`) — `auth.uid()` is `null` under the
service role.

**And grant it to `service_role` explicitly.** Since
`20260713151000_function_grant_hardening.sql` ran
`alter default privileges in schema public revoke execute on functions from
public`, a new `public` function is executable by *nobody* until it is granted.
The service role's EXECUTE used to arrive via that implicit PUBLIC grant, so
anything called through `createAdminClient()` now needs:

```sql
grant execute on function public.<fn>(<args>) to service_role;
```

This is not hypothetical. Omitting it took down every host-only action for two
weeks (`is_event_host` — hosts were told *"Only the host can invite people to
this plan."*) and shipped guardian approval broken on day one
(`resolve_parental_approval`). Neither failed at migration time, because
migrations do not run as `service_role`; both failed for real people.
`supabase/tests/service_role_grants.test.sql` asserts the grant for every
admin-called function — add yours to that list when you add the RPC.

Litmus test: *does this admin-client line trust an id/field from the request
without proving the caller owns it — and can `service_role` actually execute
what it calls?*

## 6. Encode untrusted data for its destination

User-controlled text (event titles, descriptions, names, contacts) must be
encoded for wherever it lands. Use the shared helpers in `src/lib/security.ts`
so the rules live in one tested place:

- **Into an inline `<script>` / JSON-LD** → `serializeJsonLd()`. Raw
  `JSON.stringify` does not escape `</script>` and is a stored-XSS vector.
- **Into a CSV export** → `csvCell()`. Quote per RFC 4180 **and** neutralize
  spreadsheet formula injection (a cell starting with `= + - @`).
- **Into an iCalendar feed** → `icsEscape()` (`src/lib/ics.ts`), which escapes
  `\ ; ,` and every newline form so a title can't inject calendar properties.
- **Into a redirect target** (`?next=`) → `safeNextPath()`. Only same-site
  relative paths; reject `//host`, `/\host`, `@host`, and absolute URLs to avoid
  open redirects.

We do not use `dangerouslySetInnerHTML` for user content anywhere else; React
escapes by default — keep it that way.

Litmus test: *is any user string being concatenated into HTML, a script tag, a
CSV/ICS line, or a URL without an encoder?*

## 7. Uploads: authenticate, cap, and never trust the client's MIME

Upload routes (`/api/uploads/*`) must: require a session, rate-limit per user,
cap the byte size, and write to a **per-user, server-generated path**
(`${user.id}/…-${crypto.randomUUID()}`) so a user can't write into someone
else's folder or traverse out.

Because uploads are served from a **public** bucket, the stored `Content-Type`
must come from a **server-side allowlist keyed by the validated extension**, not
from the client-supplied `file.type`. **Reject SVG** — it can carry script and
would execute from the storage origin.

Litmus test: *could a crafted `file.type`/filename get served back as something
executable, or land outside the uploader's own folder?*

## 8. Secrets stay on the server, and shared secrets compare in constant time

- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`,
  `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, Plivo creds) are **server-only**. Only
  values that are safe in the browser get the `NEXT_PUBLIC_` prefix (the Supabase
  URL and anon key are designed to be public; the anon key is not a secret).
- Grep the deployed bundle for `sk-`, `SECRET`, `TOKEN`, `PRIVATE` before ship —
  there must be no server secret in client code.
- Compare shared secrets (cron/health bearer) with `bearerMatches()`
  (`src/lib/server/secret.ts`), which is constant-time and **fails closed when
  the secret is unset** — an unset `CRON_SECRET` must never leave an endpoint
  open.

Litmus test: *is a secret reachable from the client bundle, or compared with
`===` / left open when unconfigured?*

## 9. Rate-limit auth, abuse, and enumeration surfaces

Use `checkRateLimit()` (durable, Postgres-backed) on: sign-in / sign-up /
password reset, reports, uploads, guest RSVP, AI calls, and any
account-existence oracle (contact matching). Password reset returns a **generic**
response regardless of whether the account exists (no user enumeration).

## 10. Diagnostics don't leak configuration

Health/status endpoints return a coarse liveness boolean to anonymous callers.
The per-service configuration matrix, project ref, and any admin DB probe are
operator diagnostics — gate them behind the `CRON_SECRET` bearer. Which
integrations a deployment has wired up is reconnaissance, not public data.

---

## Pre-ship checklist

- [ ] Every new table: `enable row level security` + policies scoped to a role.
- [ ] Every new UPDATE policy has a `WITH CHECK`; ownership columns are frozen.
- [ ] No authority/rank/credit column on a self-writable row.
- [ ] Every `createAdminClient()` call re-authorizes the specific caller+resource.
- [ ] Untrusted text is encoded for its sink (script/CSV/ICS/redirect).
- [ ] New upload paths: auth + size cap + per-user path + server-derived MIME.
- [ ] No new server secret is `NEXT_PUBLIC_`; bundle grep is clean.
- [ ] Auth/abuse/enumeration endpoints are rate-limited.
- [ ] Tested logged out: anon can't read/write anything it shouldn't.
- [ ] `npm test` (encoders + engine) and `supabase test db` (RLS invariants) pass.

## Automated guardrails (keep them green)

- `src/lib/security.test.ts` — the output encoders.
- `supabase/tests/rls_invariants.test.sql` — poll-vote / mutual-intent anonymity
  and the room-membership (C1) invariant.
- `supabase/tests/authz_hardening.test.sql` — the F1/F2/F6 fixes and the F8
  authority-column tripwire.
- `supabase/tests/launch_hardening.test.sql` — least-privilege on definer
  functions and durable rate limiting.
- `supabase/tests/live_location.test.sql` — live-location owner-only RLS and the
  `find_nearby_people` mutual/block/visibility/radius/coarsening invariants.
- `supabase/tests/zone_presence.test.sql` — `moments` stays owner-only and
  `zone_presence` counts only other, live, unblocked people in its own zone.
- `supabase/tests/profile_column_grants.test.sql` — SB-01's column allowlist is
  actually in force (no table-wide SELECT on `profiles`), the withheld columns
  are still withheld, and the columns the app reads are readable.
- `src/lib/profile-column-grants.test.ts` — no `profiles` column is left off the
  allowlist without a written reason.

## Media privacy (gated content)

Access-gated media (event-thread and cancellation voice notes, capsule photos)
lives in the **private** `media-private` bucket, which has no public-read policy.
Uploads (`/api/uploads/*`) return a storage **path**, which is what gets stored
in the DB column. The render site — always a server component that has already
passed the row's RLS gate — mints a short-lived signed URL with `signMediaRef()`
(`src/lib/server/media.ts`) just before rendering, so a viewer must pass the
app's authorization to ever receive a URL. `signMediaRef` also passes through
legacy/external `https://` values unchanged, so old public-bucket rows keep
working. Genuinely public media (profile avatars/covers, event covers) stays in
the public buckets. When adding a new gated-media surface, upload to
`media-private` and sign at the (server) render site — never store or render a
public URL for gated content.

## Contact details on a plan (the invitee card)

Tapping someone on an event opens their card, and for a host or co-host that
card can text or email them (`src/components/events/InviteeSheet.tsx`). There is
exactly one source for what it shows, and it is not the profile:

- **`invites.guest_contact` only.** That value is the email or phone *the host
  themselves entered* when they added the person — the same string the cascade
  already sends the invitation to, and the same one the guest-list CSV exports.
  Showing it back to the host reveals nothing they did not provide.
- **An account holder's `contact_email` / `contact_phone` are never on this
  surface.** They are withheld from the API by column grant
  (`20260710120000_lock_sensitive_profile_columns.sql`) and reachable only by
  their owner through `my_private_profile()`. `contact_public` is *not* a
  licence to widen this: its promise to the user is "put these on the QR /
  contact card people scan", not "show them to every host of every plan I was
  invited to". Honouring an opt-in more broadly than it was worded is the same
  bug as ignoring it.
- **The gate is on the server, in one place.** `inviteePerson` in
  `src/app/events/[id]/page.tsx` returns identity fields and nothing else unless
  `canManage`. It has to be there rather than in the component, because these
  objects are props of a client component and ship to the browser whether or not
  the UI draws them.
- **Addresses are validated before they reach a URL.** `classifyContact`
  (`src/lib/invitee-contact.ts`) normalises a phone to E.164 and requires
  `isEmail` for an address, so neither can carry a `?`, `&`, or newline into the
  `sms:`/`mailto:` it is interpolated into; everything else in the link is
  `encodeURIComponent`d (§6). Covered by `invitee-contact.test.ts`.

A direct invite (`inviteConnectionNow`) writes with the service-role client and
so re-authorizes twice (§5): the caller must manage the event, and must have an
accepted connection to the target read through *their own* RLS client, with
`are_blocked` consulted for a block that outlived its connection row.

Litmus test: *is any contact detail on this page something the viewer did not
themselves supply?*

## Live location (opt-in presence)

Live location (`live_locations`, `find_nearby_people`) is the most sensitive PII
the app handles, so it is fenced the same way as poll votes and mutual intents —
the raw data is **owner-only**, and all cross-user exposure goes through one
security-definer function that encodes the privacy contract.

- **The table is owner-only in every direction.** `live_locations` RLS pins
  `user_id = auth.uid()` in both `USING` and `WITH CHECK` for select/insert/
  update/delete, so no user can read another user's precise coordinate through
  the table, nor forge/repoint a row (the `user_id` PK can't be changed to
  someone else). There is **no** cross-user `select` policy — discovery is
  exclusively `find_nearby_people`.
- **Discovery is mutual, and coarsened.** `private.find_nearby_people` (public
  invoker wrapper, same convention as the other definer bodies) returns rows
  only to a caller who is **themselves** currently sharing ("see and be seen"),
  filters on `are_blocked` and the target's `visibility` scope (`connections`
  requires `are_connected`), bounds by radius, and **rounds returned coordinates
  to ~110 m** so a fellow sharer never receives an exact fix. The owner's own
  precise point stays owner-only.
- **Opt-in and ephemeral.** Nothing is stored until the user taps "Share my
  location"; every row carries an `expires_at` (clamped 1–8 h), is ignored past
  it, and is swept by the retention cron (`sweepExpired`). "Stop" deletes it.
- **No authority column.** `visibility`/`expires_at` govern only the owner's own
  exposure — they are preferences, not privileges over others or shared
  resources (docs §3), so they are safe on a self-writable row.

Litmus test: *can a caller who is not sharing — or is blocked, or outside the
target's visibility scope — learn another user's location, or read a precise
coordinate straight off the table?*

## Home density (a boolean, and only a boolean)

The Around pillar appears only when a viewer's city has an anchored zone they
may access or another active live-location sharer. That decision is made by
`home_around_available` (`20260902120000_home_density_signal_default.sql`):

- **Home receives one boolean.** The private definer body evaluates a 50 km
  radius and returns no row, identity, count, or coordinate. It honors private
  zone membership, blocks, and the sharer's `connections` visibility scope.
- **A home point is owner-private.** `profiles.home_latitude` and
  `profiles.home_longitude` are deliberately absent from the profile SELECT
  allowlist. The owner can retrieve that exact point only through
  `my_home_point()` while editing their profile; ordinary profile readers and
  Home cannot select it.
- **The point is explicit.** Editing the city as free text clears a prior point;
  choosing a place suggestion stores a validated pair. The database rejects a
  half-coordinate, an out-of-range coordinate, and null island.

Availability's remembered circle is private for the same reason:
`last_signal_circle_id` is withheld and exposed only to its owner as a scalar
through `my_signal_default_circle()`. A trigger and the setter both require it
to name a circle owned by that profile.

Litmus test: *does any density surface reveal more than whether Around has
something behind it, or let a user associate their preference with somebody
else's circle?*

## Zone presence (a count, and only a count)

`moments` is owner-only under RLS, so the zone page could never truthfully say
how many people were in a zone — it was counting the reader's own check-ins and
calling them "people". `zone_presence` (`20260810120000_zone_presence.sql`) is
the one thing that crosses that boundary, and it is fenced the same way as
`find_nearby_people`:

- **A `SECURITY DEFINER` body in `private`, behind a thin public invoker
  wrapper**, `revoke`d from `public`/`anon` on both sides.
- **It returns an integer.** No id, name, headline, coordinate, or experience
  list — nothing that says *who*. Identities at a place still need mutual
  exposure through `find_shared_moments`, which is unchanged.
- **It excludes the caller**, so a zone can never describe you to yourself in the
  third person, and **honours `are_blocked`** relative to whoever is asking.
- **Avoids are deliberately not filtered.** Give Space is "warn, never remove";
  silently shrinking a count is removal, and the surface returns an integer so it
  cannot annotate an avoid either (see the invariant below).

The exposure this accepts: checking into a world-readable zone
(`zones_select using (true)`) tells everyone else in that zone that *someone* is
there. That is the entire purpose of a serendipity zone, and it is opt-in per
check-in. Covered by `supabase/tests/zone_presence.test.sql`.

Litmus test: *does a zone surface ever return something that identifies who is
there, to someone who has not themselves checked in?*

## Private zones (membership decides readability)

Zones shipped world-readable — `zones_select ... using (true)` — which was right
for the conference/festival case they were built for and wrong for every private
gathering someone tried to use them for. `20260812120000_private_zones.sql` adds
`visibility` plus a `zone_members` roster, following the boards model rather
than inventing a second access system.

- **The policy is the only gate.** `zones_select` is
  `visibility = 'public' or is_zone_member(id, auth.uid())`. Every zone reader —
  the `/zones` list, the zone page, the map's Zones layer, `locateMyPlaces` —
  goes through the caller's RLS client, so all of them inherited the restriction
  without being modified. Do not reimplement this check in a page; if a new
  surface needs zone rows, read them through RLS and it is already correct.
- **Membership is never self-writable.** Base RLS lets only organizers and
  moderators insert into `zone_members`; the join paths are definer functions
  that re-check the caller and the specific zone. `join_zone_via_code` forces
  `role = 'member'`, so a shared link can never mint a moderator.
- **The code is the capability**, exactly as for boards: minting and rotating
  are moderator-only, and rotating invalidates every link already shared.
- **Ownership and membership identity are frozen by trigger** (`organizer_id`,
  `zone_id`, `member_id`), since RLS cannot compare OLD to NEW.
- **Checking in is gated on the write.** `moments.zone_id` is owner-only under
  RLS, so nothing stopped a non-member from checking into a private zone and
  landing in its presence count — the one number that crosses the member
  boundary. A `BEFORE INSERT OR UPDATE` trigger on `moments` enforces
  `can_view_zone`.
- **A private zone's address is a door, not a 404.**
  `find_private_zone_by_slug` returns the id, the name, and whether you have
  already asked — nothing else, keyed by exact slug, at most one row. It answers
  "does this address exist" for someone who was handed the URL; it cannot be
  used to enumerate private zones or read their contents.

Covered by `supabase/tests/private_zones.test.sql`.

Litmus test: *could someone outside a private zone learn its description, its
roster, its coordinates, or that anyone is in it?*

## Known residual risks / follow-ups

## Give Space safety invariant

Give Space is a shield, never a tracking surface. An avoid entry may only
filter or privately annotate information the viewer was already authorized to
see on a page they opened. It must never generate a notification or digest,
widen a query, reveal attendance that was hidden, or appear on a map, zone,
moment, or other location surface. Avoid entries remain readable only by their
owner. Any future feature that conflicts with this rule must change the privacy
model explicitly and receive a dedicated security review first.

These are accepted or deferred, documented so they aren't rediscovered as
surprises:

- **Room member add (F3, reduced).** Bare user-created rooms are no longer
  possible (the `rooms_insert` policy was removed; rooms are minted only by
  definer flows). A legitimate event host can still add a member to their own
  event's Living Room; fully consent-gating that needs a product change.
- **`style-src 'unsafe-inline'`.** `script-src` is nonce-locked with no
  `'unsafe-inline'`/`'unsafe-eval'` in production (`src/lib/csp.ts`), but
  `style-src` keeps `'unsafe-inline'` because inline `style={{…}}` attributes
  are pervasive and CSP nonces don't cover style attributes. Style injection is
  far lower risk than script injection.

**`connect-src` names the project, not the platform.** It is derived from
`NEXT_PUBLIC_SUPABASE_URL` in `src/lib/csp.ts`, never hardcoded. The
`https://*.supabase.co` wildcard it replaced authorised every Supabase project
on the internet, and simultaneously blocked the local stack and CI, which serve
the database from `127.0.0.1:54321` — so the realtime socket was refused on
every page that opens one, everywhere except a deployment. Nothing reported it:
**a CSP violation throws nothing, fails no request, and writes no server log**,
which is why `src/lib/csp.test.ts` exists and why the policy lives in a module a
test can import (Next's proxy file may export only its one function). Adding a
host to any directive means adding the case there.
- **OG image route** renders public event metadata (title/time/location) for any
  event id without auth by design (link unfurling). Keep it to non-sensitive
  fields only.
- **Legacy public media objects.** Rows created before the private-bucket
  migration still point at public URLs; `signMediaRef` serves them as-is. Run
  `npm run migrate:legacy-media` (dry-run by default; `-- --apply` to execute)
  to copy those objects into `media-private` and rewrite the columns to paths,
  retroactively securing them.
