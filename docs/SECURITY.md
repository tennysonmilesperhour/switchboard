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
  role changes go through security-definer functions. For boards that function
  is `set_board_member_role` (`20260930044000_board_moderators.sql`): a trigger
  refuses any other write to `board_members.role` (lifted only by that
  function's transaction-local flag, the `rotate_event_share_token`
  precedent), it never demotes the last moderator, and only the founder may
  step the founder down. The last moderator cannot leave; if an account
  deletion takes them, the longest-standing member is promoted, so a board
  with people in it always has someone who can run it.
- Verification attaches to what was verified. A venue's `status` is frozen to
  moderators, but its owner may edit the name, area, perk, and link, so an
  edit to any of those on a verified venue sends it back to `pending`
  (`freeze_venue_authority`, `20260929160000_private_place_leaks.sql`).
  Otherwise one honest claim, once verified, could be renamed into another
  business and carry the verified perk onto its plans.
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
  What a platform moderator can do about a report (suspend, remove) is in
  "Moderation" below; every one of those decisions is made in the database.
- A block reaches the rooms a pair shares (D12,
  `20260930020000_room_blocks_and_controls.sql`). A two-person room (`match`,
  `moment`) becomes read-only for both people: `private.room_closed_by_block`
  sits in the `messages`, `room_items` and `expenses` write policies and in the
  ledger functions, so nothing new can be added by either side while what was
  said stays readable. A plan's room keeps working, and `notifyRoomActivity`
  drops the notification between the pair (it fails closed if the block list
  cannot be read). The room tells the blocker who they blocked and tells the
  other person only that the room is read-only.
- Room membership rows are identity-frozen by trigger. `room_members_update`
  pins `member_id` but not `room_id`, so before
  `20260930020000_room_blocks_and_controls.sql` a member could repoint their own
  row at any room id and read it. Only `last_read_at` and `muted` change now.
- People discovery is see-and-be-seen, in the database: `list_discoverable_people`
  returns nothing to a caller who is not discoverable themselves (or is on
  sabbatical), and an active `discover_connect` intent needs the same standing
  under the `mutual_intents` policy; withdrawing one never does. Its "Nearby"
  lane compares home points snapped to the same 0.25° cells as the Home density
  check, so a moved home point learns no more than a city-sized cell
  (`20260930042000_discovery_requires_discoverable.sql`).
- A sabbatical is enforced where it pauses something, not in the page
  (`20260930080000_sabbatical_mode.sql`, D6). The `mutual_intents` policy
  refuses an active Mutual or discovery interest from or to someone on
  sabbatical (withdrawing is always allowed), `rituals_insert` refuses a
  proposal either way, the ritual reminder claim skips the pair, and texts and
  emails are dropped at the queue by `private.hold_job_for_sabbatical` unless
  `private.sabbatical_allows` lets the kind through. The push gate asks
  `sabbaticalAllows` (`src/lib/sabbatical.ts`), the same list, and
  `sabbatical.test.ts` fails if the two differ. The note is the owner's own
  text, shown to others as text only and capped at 140 characters.
- A standing ritual's terms and schedule are not writable from a session
  (`20260930081000_ritual_reminders.sql`, D8). `private.guard_ritual_update`
  lets a session move only the status, only along the ritual's life, and only
  the invited partner may accept; activity, cadence, `last_planned_at` and
  `due_on` change only in definer code (`skip_ritual`, `note_ritual_planned`,
  `create_event_atomic`), and an insert must be a fresh proposal. Before, the
  proposer could accept their own proposal, and a due date either person could
  rewrite would have let them make the reminder cron message the other every
  minute. `ritual_reminders` records one reminder per ritual, due date and
  person, written in the same statement as the claim, so a reminder is sent at
  most once.
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

A push subscription is the one place possession is proved by the browser
itself. `POST /api/push/subscribe` hands a row from a previous account to the
caller only when the endpoint **and** both keys (`p256dh`, `auth`) match what
the caller sent: all three are held by the browser that owns the subscription,
so an attacker who learned an endpoint alone cannot detach it from its owner.
Sign-out releases the subscription first (`releasePushOnSignOut`), so the next
person on the device never receives the last one's notifications.

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

- **Auth and uploads fail closed.** Pass `{ failClosed: true }` anywhere an
  unavailable limiter would otherwise admit credential guessing, account
  creation, recovery/confirmation mail amplification, or uploads. Limiter
  faults are reported as `SB-RATE-LIMIT`; they must not silently become an
  unlimited path.
- **Connection buckets stop brute force; identifiers only slow it down.**
  Sign-in permits 30 attempts per Vercel-forwarded client IP per 10 minutes and
  sign-up permits 12 per IP per hour. An identifier crossing its higher-volume signal
  threshold (20 sign-ins per 10 minutes; 10 sign-ups per hour) gets a 750 ms
  backoff, not a denial. A stranger who knows an email or handle must never be
  able to lock that account out remotely.
- **Contact matching is limited at the database boundary, and says so.**
  `resolve_profile_contact` consumes an authenticated-user bucket of 10 email
  or phone lookups per hour inside the private function body; on exhaustion it
  raises (`P0001`, hint `SB-RATE-LIMIT`) rather than returning no rows, so a
  throttled host is told to wait instead of watching friends silently become
  unlinked guests (`20260903120000_contact_match_throttle_signal.sql`). A
  handle-shaped identifier does not spend the bucket: handles are public at
  `/u/<handle>`, so a handle lookup reveals nothing the bucket protects. The
  action-level limiter is useful defense in depth, but it is not the security
  boundary because future callers could otherwise omit it.
- **Recovery trusts proof of ownership, not editable profile text.** Reset and
  confirmation resend resolve an email sign-up from `auth.users.email`; a
  username account may recover only through a verified `profile_contacts`
  email. Never use `profiles.contact_email`, which its owner can edit.
- **Every AI entry point has its own per-user budget.** Discovery is 20/hour,
  plan generation is 30/hour, and room-message extraction is 60/hour. If the
  extraction budget is exhausted, the message still saves and only the AI
  enrichment is skipped.

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
- `supabase/tests/invite_blocks.test.sql` — event invite inserts honor blocks,
  cap each plan at 100 rows, and never let a host write an accepted RSVP.
- `supabase/tests/matchmaker_blocks.test.sql` — a matchmaker intro can never
  pair two people who have blocked each other, and an intro sent before a
  block closes instead of opening a shared room.
- `supabase/tests/room_blocks_and_controls.test.sql` — a block makes a
  two-person room read-only for both people and leaves group rooms working, a
  membership row cannot be moved into another room, leave follows D20, and a
  room photo can only point at the writer's own upload folder.
- `supabase/tests/split_the_bill.test.sql` — the payer must be in the room,
  shares add up and are written only by the ledger functions, only the logger
  or payer may edit, and settling touches exactly one pair.
- `supabase/tests/people_controls.test.sql` — household members must be the
  owner's connections, an ignored request stays hidden for 90 days and the
  sender never learns it, and only a party to a match can unmatch it.
- `supabase/tests/cohost_access.test.sql` — a co-host can open and run the plan
  they co-host, a stranger still can't, and only a connection or an invitee
  can be made a co-host (D1).
- `supabase/tests/guardian_hold.test.sql` — every RSVP path holds a guardian
  plan's yes without a seat, only the guardian's approval makes it count (with
  capacity re-checked), and no other write can.
- `supabase/tests/invite_list_visibility.test.sql` — the invite list shows only
  invitations that went out, only when the host allows it, and never a contact
  or an RSVP the host kept private.
- `supabase/tests/private_place_leaks.test.sql` — a private zone's headcount
  and its members' moments stay invisible to non-members, same-named zones do
  not cross-match, and editing a verified venue sends it back to review.
- `supabase/tests/client_feedback.test.sql` — the unauthenticated feedback
  intake stays write-only, its bucket stays private, and its bounds hold.
- `supabase/tests/scope_progress.test.sql` — the shared checklist board is
  unreachable from `anon` at the database level, and only real item ids are
  accepted, which is what bounds an open write surface.
- `src/lib/copy-only.test.ts` — what the twice-daily feedback job may merge
  without a human, and the far longer list of what it may not.
- `supabase/tests/profile_column_grants.test.sql` — SB-01's column allowlist is
  actually in force (no table-wide SELECT on `profiles`), the withheld columns
  are still withheld, and the columns the app reads are readable.
- `src/lib/profile-column-grants.test.ts` — no `profiles` column is left off the
  allowlist without a written reason.
- `supabase/tests/private_zone_requests.test.sql` — a denied or removed
  requester waits 30 days for their one new ask, cannot erase a decision, and
  leaving or removal ends their check-in in the zone.
- `supabase/tests/shared_moments_distance.test.sql` — located check-ins match
  within about 200 m and not at 1 km; zones, blocks and anonymity still hold.
- `supabase/tests/discovery_requires_discoverable.test.sql` — browsing and
  marking interest require being discoverable; Nearby compares locations.
- `supabase/tests/zone_end_dates.test.sql` — every zone ends, nobody checks
  into an ended one, and deleting a zone ends the check-ins in it.
- `supabase/tests/board_moderators.test.sql` — board roles change only through
  `set_board_member_role`, and no board is left without a moderator.
- `supabase/tests/sabbatical_mode.test.sql` — a sabbatical holds every text and
  email except from plans the person is in (the inbox row is still written),
  pauses Mutual both ways without trapping an old intent, and leaves guest
  texts alone.
- `supabase/tests/standing_rituals.test.sql` — only the two people see a
  ritual, only the partner accepts it, the terms and schedule are not
  session-writable, skipping is theirs alone and moves one cadence ahead, and
  the reminder claim is once per person per due date, on their own due day,
  outside quiet hours, never across a block or a sabbatical.
- `supabase/tests/moderator_actions.test.sql` — only a platform moderator can
  suspend, lift, or remove a post or message, and only against an open report
  about it; a room-message report copies the message from the row (a
  non-member cannot use one to read it); a suspension is enforced on writes;
  removed content is hidden from members and frozen; nobody can write the
  audit trail.
- `supabase/tests/plan_polish.test.sql` — only a host or co-host can turn an
  Open Table request down, and only one still waiting; a live window only
  grows, only while the plan is inviting; a no becomes a yes only while the
  plan is inviting and never over a guardian's no; the browser cannot change a
  plan's parental approval or recurrence; and only people who went, the host
  and co-hosts write the Memory Capsule.
- `supabase/tests/rls_initplan.test.sql`, `foreign_key_indexes.test.sql` and
  `single_permissive_policies.test.sql` — every policy calls `auth.uid()` once
  per statement, every foreign key has a covering index, and no table has two
  permissive policies for the same role and command. These are cost rules, not
  access rules, but a new policy or key that breaks one fails CI.

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

Room photos joined this bucket in `20260930021000_private_room_photos.sql`
(they had been public "so realtime needs no signing"). Two things are specific
to them:

- **A path must be in its writer's own folder.** Room rows are writable from the
  browser, and the bucket also holds other people's voice notes and capsule
  photos, so a room that signed any stored path would sign *those*. A trigger
  on `messages.image_url` and photo `room_items.url` refuses a path whose first
  segment is not the writer (`auth.uid()`, or the sender the server
  authenticated), and `signRoomPhotos` (`src/lib/server/room-media.ts`) checks
  the same thing again before minting a URL.
- **Realtime carries the path, not a URL.** A photo that arrives live is signed
  by `signRoomMessagePhotos`, which re-reads the message through the caller's
  own RLS client first; the page signs everything it renders in one batch.

## Moderation (what a platform moderator can do)

Platform moderators are appointed only by the operator
(`platform_moderators`, deny-all to users; `20260713170000_moderation_queue.sql`).
Since P7 (`20260930070000_moderator_actions.sql`, decision D7) they can act on a
report from `/moderation`, not just record a status:

- **Every action is decided in the database, for the caller and the
  resource.** `moderate_suspend_account`, `moderate_lift_suspension`,
  `moderate_remove_board_post` and `moderate_remove_room_message` are the usual
  private-definer bodies behind invoker wrappers; each re-checks
  `private.is_platform_moderator(auth.uid())`, and a suspension or removal must
  name an **open report about exactly that account, post or message**. The
  server actions (`src/lib/actions/moderation.ts`) run on the moderator's own
  session client and never use `createAdminClient()`.
- **A suspension is the auth server's own ban** (`auth.users.banned_until`),
  which nobody can write from the API. There is one copy of the state, so the
  three places that read it cannot disagree: GoTrue refuses the password,
  refresh and email-link grants (sign-in shows `SB-AUTH-SUSPENDED` with the
  support address, docs/AUTH.md); the proxy signs a live session out to
  `/login?error=suspended`, and `requireUser` refuses a Server Action from a tab
  that was already open; and `private.is_suspended` sits in the `messages` and
  `board_posts` write policies, so an access token issued before the suspension
  cannot add what a moderator removes for the rest of its lifetime. It also
  takes the account off the map (`find_nearby_people`), out of people discovery
  (`list_discoverable_people`), and out of Mutual: an active connect interest
  can be neither sent by nor aimed at a suspended account, so nobody is matched
  into a room with someone who cannot sign in
  (20261006120000_suspended_not_offered.sql). A moderator
  cannot suspend themselves or another moderator (moderator authority is the
  operator's to remove). Open-ended suspensions are stored a century out,
  because GoTrue has no "forever"; a moderator can lift any suspension early,
  including one set outside the app, from the same page.
- **Removal is soft and frozen.** `removed_at` on `board_posts` / `messages`
  can be set only by the moderator functions (a trigger refuses every other
  write, including the service role's, unless their transaction-local flag is
  on — the `set_board_member_role` precedent). The SELECT policies hide removed
  rows from members, which also stops the author editing or deleting them (an
  UPDATE or DELETE with a WHERE clause applies the SELECT policy). Removing a
  message also deletes what it filed into the room's tabs, so a removed photo
  does not stay up in the Photos tab.
- **Reports attach what was reported, from the row, never from the reporter.**
  A `BEFORE INSERT` trigger on `user_reports` copies a room message's body and
  photo path (and a board post's title and body) into the report and overwrites
  `reported_id` with the real author. Because the reporter can read their own
  report, the trigger refuses (`P0002`) a message or post the reporter cannot
  read: a report is never a way to copy something out of a room or board you
  are not in. A message report keeps its snapshot after the sender deletes the
  message (`message_id` is `ON DELETE SET NULL`), and `deleteMessage` leaves a
  reported photo in storage so the moderator can still see it. The moderation
  page signs that photo with `signRoomPhotos` after the moderator gate and
  hands the browser only the signed URL.
- **Everything is on the record.** `moderation_actions` (who, what, when, which
  report, the note, how long) is written only by those functions and readable
  only by moderators; account deletion clears the actor or subject
  (`ON DELETE SET NULL`) without erasing the decision.

Litmus test: *could anyone but an appointed moderator change what a member
sees or whether they can sign in, or could a report carry anything the
reporter could not already read?*

## Event invitations (consent is not host-writable)

An invitation lets a host ask; it never lets the host answer for somebody
else. The write boundary is shared by the wizard, add-people controls, direct
invites, open-table requests, and share-link RSVP rows:

- **Blocks are symmetric at insert time.** The `enforce_invite_insert` trigger
  compares the event's primary host with a profile invitee under the event-row
  lock. A block in either direction rejects the insert, including through the
  service-role and security-definer paths.
- **A plan carries at most 100 invite rows.** The same trigger serializes on the
  event and counts before inserting, so concurrent requests cannot race past
  the ceiling. Server actions reject oversized batches earlier for a useful
  message; the trigger remains authoritative.
- **Hosts may enqueue or send, not RSVP.** `invites_insert` accepts only
  `queued` and `sent`. `accepted`, `declined`, `waitlisted`, and the other
  response states are written only by the recipient/token response functions —
  and, on a plan that needs a guardian's approval, a yes is `pending_approval`
  until the guardian's own token-addressed answer makes it count (see
  "Guardian approval" below).
- **External text is metered.** Invitation and cancellation email/SMS consume
  durable per-host daily allowances before a provider is called. Email and SMS
  share the same allowance; in-app notifications are not part of that external
  recipient limit.
- **Editing a live line touches only invitations that have not gone out.**
  `move_queued_invite`, `set_invite_stage` and `set_invite_window` are
  security-definer, host-or-co-host only, and every one of them guards on
  `status = 'queued'` — the swap under a row lock, `set_invite_stage` in the
  UPDATE's own `WHERE` so the check and the write cannot come apart. An
  invitation that has already reached somebody is history: it cannot be
  reordered, re-waved, or re-timed, and the caller is told so rather than
  silently changing nothing. The one exception is decision D17: while the plan
  is inviting, `set_invite_window` may give a *sent* invitation **more** time —
  never less, and never once its window has run out (Resend does that) — with
  the invite row locked for the check and the write
  (`20260930060000_plan_polish.sql`). `set_invite_stage` additionally bounds
  the wave to one the plan already has (or the one after it, five at most),
  because a gap reads to the cascade engine as a stage that has resolved. This
  is why no broad UPDATE policy on `public.invites` exists. Covered by
  `supabase/tests/invite_stage_editing.test.sql` and `plan_polish.test.sql`.
- **A no can become a yes, but only the invitee's own no (D17).** While the
  plan is inviting, `respond_to_invite` accepts an answer on a `declined`
  invitation as well as a `sent` one, through the same capacity check,
  guardian hold and room membership as a first yes. A no whose latest guardian
  request was denied is the guardian's, and stays a no. An Open Table request
  that the host turns down is **deleted**, never kept as `declined`
  (`decline_join_request`): a kept row would let the person the host turned
  away say yes to themselves, and `can_view_event` admits any invitee who is
  not queued.

Litmus test: *can a host name an arbitrary profile/contact and either bypass a
block, manufacture attendance, or turn one plan into an unbounded message
sender?*

## What a plan keeps from its creation, and who writes its capsule

- **Parental approval and recurrence are founding rules (D18).** The edit form
  changes the cover, theme, reminders, Open Table and adds questions, but
  `events_update` admits the host and every co-host for any column, so a
  trigger (`events_freeze_founding_rules`, `20260930060000_plan_polish.sql`)
  refuses a change to `parental_approval`, `recurrence` or
  `recurrence_interval_days` from the browser roles. Otherwise a co-host could
  switch off guardian approval straight through the API after minors said yes
  under it. Server-side roles can still correct a plan.
- **The Memory Capsule is written by the people who went (G28).** Its insert and
  update policies require `private.can_add_to_capsule`: an accepted invitation
  to the plan, or being its host or a co-host. They used to ask only
  `can_view_event`, which admits anyone who declined or whose invitation
  expired. Reading is unchanged. The page asks the caller-bound
  `can_current_user_add_to_capsule`, which cannot be pointed at somebody else.

Covered by `supabase/tests/plan_polish.test.sql`.

Litmus test: *can someone change the rules a plan's guests said yes under, or
write the record of a night they did not attend?*

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
`are_blocked` consulted for a block that outlived its connection row. Picked
ids sent to `addPeopleToEvent` meet the same connection rule: an id that is not
one of the caller's accepted connections is skipped, so a forged id cannot ride
the connection picker onto a guest list. Adding anyone else is a deliberate act
by handle, email, or phone.

Litmus test: *is any contact detail on this page something the viewer did not
themselves supply?*

## Co-hosts (who may be one, and what they can read)

A co-host shares the host's powers: `is_event_host` is true for them, so every
host-gated write policy and definer function already admits them. Two things
follow, and both used to be broken
(`20260930010000_cohost_plan_access.sql`):

- **A co-host can read what they manage.** `can_view_event` admits co-hosts, so
  the plan page, its polls, questions and thread open for them without an
  invitation; `invites_select` routes through `is_event_host` like
  `invites_insert`/`invites_delete` already did. Before, a co-host without an
  invite was bounced from `/events/<id>` to `/join/<id>`, and their delete of an
  Open Table request matched zero rows (a DELETE only reaches rows the caller
  may SELECT). `/plans` and the calendar feed list co-hosted plans.
- **Only someone the host knows can be made one (decision D1).** The
  `event_cohosts_host` policy's WITH CHECK requires `private.cohost_eligible`:
  an accepted connection of the primary host, or someone already on this
  plan's guest list (not an unanswered Open Table request), never across a
  block. Co-hosting hands over the guest list, every guest's contact card and
  the cancel button; a typo'd handle must not be enough. The roster itself
  stays primary-host-only, and removal is never blocked by eligibility.

Covered by `supabase/tests/cohost_access.test.sql`.

Litmus test: *can the primary host hand plan-management powers to a stranger,
or can a co-host be locked out of a plan the database already lets them run?*

## The invite list (who else is invited)

"Show the whole invite list" (`events.show_invite_list`, decision D3) is read
through one definer function, `event_invite_list`
(`20260930012000_invite_list_visibility.sql`), never a policy on `invites`
(which would expose every column, contacts included) and never a filter in the
page:

- Only for someone who can view the plan, and only when the host has switched
  the list on (managers always).
- Only invitations that have gone out: sent, accepted, waitlisted, or a yes held
  for a guardian. Never somebody still queued — being listed would tell them
  and everyone else where they sit in the host's line — and never a decline, an
  expiry, a withdrawal or an unanswered Open Table request.
- Identity fields only. A guest "name" that is really the email or phone the
  host typed is shown as "Guest"; `guest_contact` never leaves the function.
- A status only when "show who's in" is also on. Otherwise everyone reads as
  `invited`, so the list is not a side door to RSVPs the host kept private; a
  guardian-held yes always reads as `invited`.

`show_expired` was never read by anything and is retired: no longer offered or
written by the app, kept as a column only so plan creation keeps working.

Covered by `supabase/tests/invite_list_visibility.test.sql`.

Litmus test: *can a guest learn who is queued, who declined, how to reach a
guest, or who said yes when the host chose not to show it?*

## Guardian approval (a held yes, and two separately authorized paths)

On a plan with `parental_approval`, a yes does not count until a parent or
guardian approves it (decision D2, `20260930011000_guardian_hold.sql`). It used
to count at once and could only be taken back by a denial, the in-app RSVP never
asked for a guardian at all, and a yes whose guardian step was abandoned in a
closed tab simply stayed counted.

- **Every RSVP path holds the yes as `pending_approval`.** `respond_to_invite`,
  `rsvp_via_share_token`, `respond_to_guest_invite` and `approve_join_request`
  (a host letting in an Open Table request is not the guardian's yes) all write
  it instead of `accepted`. The SMS YES path refuses guardian plans outright. A
  held yes takes no seat — every capacity check counts `accepted` only — joins
  no room, gets no reminders or "going" notifications, and appears in no
  attendee list or calendar feed. It does not block the cascade and is not
  retired when the plan fills: the guardian's answer decides it.
- **Only the guardian's answer makes it count.** Approval re-checks capacity
  under the event lock at that moment (a seat if one is free, the waitlist if
  not) and grants room membership; denial releases the yes (`declined`). The
  `invites_guardian_hold` trigger enforces the invariant for every writer,
  including one added later: on a guardian plan an invite may become `accepted`
  only once its approval row is `approved`. Anything else raises.
- **The step survives a closed tab.** The held state is on the invite, so the
  plan page, `/rsvp/<token>` and the share link's hand-off all show "waiting on
  a guardian" with the form to (re)send the request. The invitee sees the
  guardian's address masked (`p•••@example.com`), and only on their own
  invitation: `/rsvp/<token>` is a forwardable link.
- **The email outcome is reported, not assumed.** Sending uses
  `sendEmailWithResult`; the outcome is stored on the request
  (`parental_approvals.email_status`) and a request whose email did not go out
  says so — with `SB-GUARDIAN-EMAIL`, or `SB-CONFIG-EMAIL` when the deployment
  cannot send mail — to the invitee and to the host, on the spot and after a
  reload. The request itself is saved either way and can be sent again.
- **The guardian sees exactly what D2 allows.** The email and `/approve/<token>`
  both render from `loadGuardianPlanFacts`: the plan's title, when and where,
  the host's name, and who said yes. Not the description, not the guest list.

Creating a guardian link is not an ordinary form post: the link decides whether
a yes counts. The invitee's request and a host's recovery resend have different
authority and must stay separate:

- **The invitee asks their own guardian.** `requestParentalApproval` reads the
  invite through the caller's session/RLS client and requires
  `invitee_id = user.id`, the submitted `event_id` to match, and the invite to
  be `pending_approval` before any service-role read or write. Asking again
  reuses the pending request and rotates its token, so a mistyped address is
  corrected without leaving a second live link behind. The browser has no
  direct INSERT policy on `parental_approvals`.
- **A host may correct and resend, not start or impersonate the invitee path.**
  `resendParentalApproval` first proves the caller manages the exact plan, then
  scopes every service-role query and update to that plan, invite, and a
  still-pending approval. A host sees every held yes — including those where
  nobody has been asked yet — but the first request is always the invitee's.
  Both paths are rate-limited per caller. A resend rotates the token, so the
  mis-addressed link it exists to correct stops working the moment the
  corrected one is sent.
- **The token column is withheld from browser roles.**
  `parental_approvals_host_read` lets a host see the guardian's name and
  address, but the token is the guardian's decision, so
  `20260903050000_parental_approval_token_column.sql` drops the table-level
  SELECT and grants back every column except `token` (the `profiles` column
  precedent). Every app read of the table goes through the service-role client
  after its own authorization check; `parental_approval_token_column.test.sql`
  proves the column stays out of reach.
- **The guardian needs no account.** `/approve/<token>` is in the proxy's
  public paths: the token is the whole authorization, and the person holding
  it is usually a parent who has never signed up. Sending them to `/welcome`
  was a dead end with the invitee's RSVP stuck behind it. For the same reason
  `resolve_parental_approval` stays a `public` definer executable by `anon`
  rather than a private body behind an invoker wrapper: `anon` has no USAGE on
  schema `private`.
- **The resolver distrusts even privileged rows.** The token-addressed
  `resolve_parental_approval` function checks that the approval's `event_id`
  equals its invite's `event_id` before mutating either row. A mismatch returns
  `invite_mismatch` and leaves both records unchanged. It approves only a held
  (or legacy already-counted) yes on a plan still taking answers; a withdrawn
  yes or a closed plan is reported, not revived.

Covered by `supabase/tests/guardian_hold.test.sql`,
`parental_approval_authz.test.sql` and `parental_approval_token_column.test.sql`.

Litmus test: *can this caller prove they own this RSVP, or manage this exact
plan—would a cross-plan approval row still be harmless—and can any write make a
guardian plan's yes count without the guardian?*

## SMS consent and suppression

Every outbound SMS calls `sendSmsWithResult`, which normalises the destination
and checks the service-role-only `sms_opt_outs` table before contacting Twilio.
The check fails closed: a database error cannot turn into an unguarded text.
Only the signed `POST /api/sms/inbound` webhook can add or clear suppressions;
it validates Twilio's HMAC over the exact configured public URL and every form
field, and binds the request to the configured account and receiving number.
No phone number or inbound message body is logged.

STOP-class keywords upsert the normalised sender, START-class keywords remove
it, and HELP does not change state. Twilio Advanced Opt-Out sends the human
reply, so the app returns empty TwiML and never duplicates it. RLS is enabled
and forced on `sms_opt_outs`, with no browser policy or browser privilege.

A guest's phone-shaped `guest_contact` does not authorize texts. Guests initiate
`JOIN <personal invitation token>` from their own phone after the disclosure on
the invitation. Consent is confined to one unclaimed invite and expires with the
plan or after 30 days. Event triggers queue logistics/reminders; legacy guest
SMS fan-out is removed. The queue and dispatch both use this consent, not host
contact text. Guest email paths retain their existing unsubscribe headers.

Coded YES/NO/CONFIRM replies require a signed Twilio sender, a delivered/sending
job for that exact phone and member, and a still-current verified contact with
SMS enabled. The RPC rechecks invitation ownership, blocks, active event state,
required questions and guardian approval. It shares the web RSVP capacity and
room-membership transition. MessageSid is an atomic receipt key. Bare YES remains
a Twilio subscription keyword; unknown messages return instructions rather than
guessing an event. Every reply is rate limited and XML escaped.

Notification routing is recipient-owned and rechecked at dispatch. New channel
choices suppress legacy member email and push/SMS duplicates. Opting into urgent
SMS does not bypass consent, STOP, channel preferences, budget limits, or the
explicit deadline. See `docs/SMS.md` for the complete behavior and retention.

Withdrawing SMS consent never silences a member. SMS can only be chosen as a
category's sole channel while it can deliver (subscribed, verified, not
STOPped), and when any of those stops being true — including a STOP arriving
through the signed webhook — database triggers put that route back to
"existing" and record why (`20260930030000_sms_route_fallback.sql`). The route
columns stay owner-readable and definer-written: members dismiss the note
through `dismiss_sms_route_note()`, never by writing the row.

## Live location (opt-in presence)

Live location (`live_locations`, `find_nearby_people`) is the most sensitive PII
the app handles, so it is fenced the same way as poll votes and mutual intents —
the stored data is **owner-only and coarsened**, and all cross-user exposure goes
through one security-definer function that encodes the privacy contract.

- **The table is owner-only in every direction.** `live_locations` RLS pins
  `user_id = auth.uid()` in both `USING` and `WITH CHECK` for select/insert/
  update/delete, so no user can read another user's coordinate through the
  table, nor forge/repoint a row (the `user_id` PK can't be changed to
  someone else). There is **no** cross-user `select` policy — discovery is
  exclusively `find_nearby_people`.
- **Precision is discarded at write.** The app action rounds latitude and
  longitude to three decimal places (roughly 110 m), and the database repeats
  that rule in a `BEFORE INSERT OR UPDATE` trigger. An authenticated client that
  writes the table directly therefore cannot retain an exact device fix. Existing
  rows were coarsened when the trigger was installed.
- **Discovery is mutual.** `private.find_nearby_people` (public
  invoker wrapper, same convention as the other definer bodies) returns rows
  only to a caller who is **themselves** currently sharing ("see and be seen"),
  filters on `are_blocked` and the target's `visibility` scope (`connections`
  requires `are_connected`), and bounds by radius. Its returned point, distance,
  radius filter, and ordering all use the same stored coarse coordinates, and
  the function **rounds them again to ~110 m** as defence in depth, so a
  fellow sharer never receives an exact fix and an exact distance or exact
  boundary test cannot undo the rounding through repeated spoofed caller
  positions.
- **Opt-in and ephemeral.** Nothing is stored until the user taps "Share my
  location"; every row carries an `expires_at` (clamped 1–8 h), is ignored past
  it, and is swept by the retention cron (`sweepExpired`). "Stop" deletes it.
- **No authority column.** `visibility`/`expires_at` govern only the owner's own
  exposure — they are preferences, not privileges over others or shared
  resources (docs §3), so they are safe on a self-writable row.

Litmus test: *can a caller who is not sharing — or is blocked, or outside the
target's visibility scope — learn another user's location, or make the database
retain a precise coordinate?*

## Home density (a boolean, and only a boolean)

The Around pillar appears only when a viewer's city has an anchored zone they
may access or another active live-location sharer. That decision is made by
`home_around_available` (`20260902123000_home_density_signal_default.sql`):

- **Home receives one boolean.** The private definer body evaluates a
  city-sized 50 km radius and returns no row, identity, count, or coordinate.
  It honors private zone membership (`can_view_zone`), blocks, and the sharer's
  `connections` visibility scope.
- **The radius is measured between coarse cells, never exact points.** The home
  point is self-writable and the RPC is unmetered, so an exact haversine against
  raw `live_locations` coordinates would be a trilateration oracle: move the
  point, watch the boolean flip at the 50 km edge, repeat from three sides, and a
  sharer's raw fix falls out at finer precision than `find_nearby_people` ever
  returns. Both sides are snapped to a 0.25° grid (~28 km) *before* the
  distance is taken (`private.coarse_distance_m`), the same lesson as
  `20260902023519_live_location_coarse_distance.sql`. Moving a home point
  anywhere inside its cell changes nothing; the most a caller can learn is
  whether some city-sized cell has someone visible to them in it, which is what
  the pillar says out loud. `home_density_and_signal_default.test.sql` pins
  this with a viewer 51 km from a sharer by exact distance who still gets
  `true`, and gets the same answer after moving 22 km within the cell.
- **Accepted exposure.** A viewer who is *not* sharing learns that someone with
  `sharers` visibility is live somewhere in their city-sized cell. That is
  strictly less than what the same person gets by opting in to share (a rounded
  pin at ~110 m through `find_nearby_people`), and it carries no identity.
- **A home point is owner-private.** `profiles.home_latitude` and
  `profiles.home_longitude` are deliberately absent from the profile SELECT
  allowlist (`WITHHELD` in `profile-column-grants.test.ts`, and
  `has_column_privilege` in pgTAP). The owner can retrieve that exact point only
  through `my_home_point()` while editing their profile; ordinary profile
  readers and Home cannot select it.
- **The point is explicit.** Editing the city as free text clears a prior point;
  choosing a place suggestion stores a validated pair. The database rejects a
  half-coordinate, an out-of-range coordinate, and null island.

Availability's remembered circle is private for the same reason:
`last_signal_circle_id` is withheld and exposed only to its owner as a scalar
through `my_signal_default_circle()`. The server action, the setter
(`set_my_signal_default_circle`), and a `BEFORE INSERT OR UPDATE` trigger on
`profiles` all require it to name a circle owned by that profile, and the
`signals_visible` policy is unchanged: `viewer_in_signal_audience` still
requires every audience circle to belong to the signal's owner, so a forged id
could never widen who sees a signal — it could only have been stored.

Litmus test: *does any density surface reveal more than whether Around has
something behind it, could repeated calls with a moved home point narrow that
down to a person, or can a user associate their preference with somebody
else's circle?*

## Shared Moments (identity unfolds only by mutual consent)

The `moments` table is owner-only. Pre-consent discovery crosses that boundary
only through `find_shared_moments`, and its result is intentionally not a
profile:

- **Anonymous means no identity field.** Before a pair reaches `revealed` or
  `accepted`, the React client payload contains the candidate moment id and
  experience categories only—no profile/user id, name, or free-text headline.
  The discovery RPC returns `headline = null` as defense in depth.
- **Blocks close discovery in both directions.** `find_shared_moments` applies
  `are_blocked(auth.uid(), candidate.user_id)`, so either person's block removes
  the pair for both callers. Curiosity and acceptance re-run the same discovery
  check and an explicit block check before any service-role write or
  notification. That check goes through `is_blocked_with`, the caller-bound
  wrapper; the two-id `are_blocked` is service-role only.
- **Safety does not require identity disclosure.** Block/report buttons on an
  unrevealed card send only the caller's and candidate's moment ids to a server
  action. The action proves the caller owns a live moment, revalidates that the
  candidate is still discoverable, then resolves the target server-side. Once
  mutual consent reveals a profile, the normal profile safety controls apply.
- **A zone is part of the place.** Two moments match only in the same zone (or
  both in none), and a zone moment only for someone who can view that zone
  (`20260929160000_private_place_leaks.sql`). Without that, typing a private
  zone's name found its members, and two zones sharing a name in different
  cities matched each other's people.
- **Where, not what was typed (D11).** In a zone, the zone is the place. Outside
  zones, two located check-ins match within about 200 m whatever each typed;
  only when either is unlocated does the typed name decide
  (`20260930041000_shared_moments_distance.sql`). The distance is taken between
  points rounded to three decimals (~110 m): a moment's coordinate is
  self-writable and the RPC is unmetered, so an exact 200 m boundary would be a
  trilateration oracle for an anonymous person's device fix. "Locate my plans"
  never geocodes a moment's bare name for the same reason — a guessed pin would
  match strangers in another city.

Litmus test: *does any field or action available before mutual reveal let the
browser identify the person behind a candidate moment?*

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
- **It answers only for a zone the caller can view.** A private zone's id is
  handed to anyone holding its address (`find_private_zone_by_slug`), so the
  count checks `can_view_zone` and is 0 otherwise
  (`20260929160000_private_place_leaks.sql`).
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
  `can_view_zone`. The one exemption is a close that leaves `zone_id` as it
  was (`20260929120000_moment_zone_checkout.sql`): it can only shrink the
  count, and refusing it both stranded a removed member in a check-in they
  could not end and rolled back the retention sweep's bulk close for everyone.
- **A private zone's address is a door, not a 404.**
  `find_private_zone_by_slug` returns the id, the name, and whether you have
  already asked — nothing else, keyed by exact slug, at most one row. It answers
  "does this address exist" for someone who was handed the URL; it cannot be
  used to enumerate private zones or read their contents.
- **Asking goes through one door, and a decision sticks (D10).** There is no
  INSERT policy on `zone_join_requests`; `request_zone_join` files or reopens a
  request and says what happened. A denial, or a removal by a moderator, is
  timestamped and allows one new ask 30 days later. A requester may delete a
  request only while it is still pending, so deleting a decision is not a way
  around the wait. The requester reads their own row, so the door shows the
  real state, and they are notified either way.
- **Out of the zone means out of its count.** Leaving or being removed closes
  the person's open check-in there (`on_zone_member_removed`), and deleting a
  zone closes every check-in in it before `moments.zone_id` is nulled — an
  open zone check-in turned zone-less would otherwise start matching strangers
  outside the zone. A zone that has ended (`zones.ends_at`, D23) takes no new
  check-ins.

Covered by `supabase/tests/private_zones.test.sql`,
`supabase/tests/private_zone_requests.test.sql`,
`supabase/tests/zone_end_dates.test.sql` and
`supabase/tests/moment_zone_checkout.test.sql`.

Litmus test: *could someone outside a private zone learn its description, its
roster, its coordinates, or that anyone is in it?*

## Client feedback: the one intake that cannot authenticate its writer

`/api/scope-feedback` accepts text and image uploads from someone with **no
session**. It is the documented exception to §7, and it exists because the
scope-of-work checklist is handed to a client by URL — they have no account and
will not make one to report a mislabelled button.

The exception is paid for rather than waved through:

- **The bucket is private** (`client-feedback`, `public = false`). Nothing
  uploaded is served from any public origin, so the stored-XSS class §7 mostly
  defends against has nowhere to land. The triage job reads screenshots through
  ten-minute signed URLs.
- **There is no public read path.** `client_feedback` has RLS on and **no
  policies at all**, so `anon` and `authenticated` can neither select nor write
  a row; only the service role reaches it. The route file exports `POST` and
  nothing else. `supabase/tests/client_feedback.test.sql` asserts both.
- **Two fail-closed rate limits**, one per client IP (6/hour) and one global
  (150/day). The global bucket is the one that bounds the damage: an open
  endpoint's worst case is a spread of addresses, not a loud one.
- **Server-derived content type** from the validated extension
  (`src/lib/server/image-mime.ts`, now shared with `/api/uploads/image` so the
  two paths cannot drift), SVG rejected, 4MB combined and 4-file caps, and a
  server-generated object path so a crafted filename cannot traverse or collide.
- **Every bound is a CHECK constraint too**, not only a guard in the route, so a
  second writer added later inherits them.

Reading the queue for triage is a separate, operator-only surface
(`/api/cron/feedback-queue`, `CRON_SECRET` bearer via `bearerMatches`, per §10).

**The board itself, however, is public — deliberately.** `/api/scope-progress`
serves the shared tick state *and the notes* (body, reporter name, and
screenshots as per-request signed URLs) to anyone who requests it, with no
session. The owner's requirement was that the checklist not be account-gated:
they send a client a link, and both of them see the same board. A
token-in-the-URL variant and a "notes public, screenshots private" variant were
both put to them explicitly; the fully open version was chosen.

So the honest statement of exposure: **`/scope-verification` is a guessable path
on the production domain, and everything on that board is readable by anyone,
including crawlers.** The page says so at the point where people type into it,
because the alternative is misleading the person whose screenshots those are.
What the openness does *not* include:

- the bucket is still not public and never listable — objects are reached only
  through signed URLs this server mints per request;
- both tables still keep RLS on with no policies, so nothing reaches Postgres
  except through a route that rate-limits it;
- the write side is still bounded and fail-closed, and `scope_progress.item_id`
  must match a real checklist id, which is what stops an open write endpoint
  from growing the table without limit.

If this ever needs to stop being public, the change is small and local: gate
`GET /api/scope-progress` on a token and add that token to the link. Nothing
else in the app reads these tables.

**What this cannot do is tell you who wrote a row.** Everything in
`client_feedback` is anonymous text from the public internet. It is a bug report
to read, never an instruction to follow — which matters because an automated job
reads it twice a day and writes code. That job's limits are in
[`docs/CLIENT-FEEDBACK-LOOP.md`](CLIENT-FEEDBACK-LOOP.md); the mechanical part
is `src/lib/copy-only.ts`, which refuses to call anything a copy change when a
changed string looks like a URL, a path or a storage key.

Litmus test: *could a stranger with the checklist link fill the table, read
somebody else's screenshot, get a file served back executable, or talk the
triage job into shipping a change that is not words?*


## Known residual risks / follow-ups

## Give Space safety invariant

Give Space is a shield, never a tracking surface. It exists to change what its
owner does, not to tell them what anyone else is doing. Avoid entries remain
readable only by their owner, and must never generate a notification or digest,
widen a query, or appear on a map, zone, moment, or other location surface.

The heads-up on a plan is the one place an avoid entry produces output, and
`20260916210002_give_space_notices.sql` holds it to five rules. Anything that
would break one of them is a change to the privacy model and needs its own
security review first:

- **Only in response to the viewer's own action.** `note_give_space_overlap`
  refuses unless the caller already holds an *accepted* invite to that plan.
  Opening a page, being invited, or asking to join is not an action. A surface
  that evaluates this because something was viewed is the bug this replaced.
- **One bit, ever.** The RPC returns a boolean and `give_space_notices` stores a
  boolean. Never a name, a count, an id, an RSVP status, or a time. Five people
  on the list and five of them going is the same value as one.
- **Frozen once true.** "They're no longer expected there" is nearly as
  revealing as "they're going", so the notice never withdraws and never
  refreshes. Evaluation is monotonic: it may raise the bit, never lower it, and
  the row is not writable from a session — an owner who could clear it could
  re-run the evaluation and read off a departure.
- **Never says who.** Copy on every surface says "someone you've chosen to give
  space", says plainly that nothing more is coming, and does not vary with the
  number of people on the list.
- **Costly to ask.** One reading per accepted invitation, in front of the plan's
  host, with the cascade and notification that follow. Probing means actually
  RSVPing yes.

`note_give_space_overlap_for` is the same decision for the Open Table path,
where the requester's commitment completes inside the host's approval request.
It is service-role only, takes the subject explicitly, and applies the identical
commitment gate — a host cannot use it to learn or plant anything, and gets
nothing back.

Litmus test: *could someone learn one thing about another person's plans that
they did not already know, without RSVPing yes to something themselves?*

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
  fields only. Since G23 it also draws the plan's cover, under the same
  `unfurlsPlanDetails` gate, and only a cover uploaded to our own public
  `media` bucket (`src/lib/server/og-cover.ts`): an unauthenticated route must
  never fetch an address a host typed. The bytes are size-capped, sniffed as
  PNG or JPEG, fetched with redirects refused, and handed to the renderer as a
  data URI.
- **Legacy public media objects.** Rows created before the private-bucket
  migration still point at public URLs; `signMediaRef` serves them as-is. Run
  `node --env-file-if-exists=.env.local scripts/archive/migrate-legacy-media.mjs`
  (dry-run by default; add `--apply` to execute) to copy those objects into
  `media-private` and rewrite the columns to paths, retroactively securing them.
  The one-off is archived because new uploads already use the private bucket.
