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

Litmus test: *does this admin-client line trust an id/field from the request
without proving the caller owns it?*

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
  `'unsafe-inline'`/`'unsafe-eval'` in production (`src/proxy.ts`), but
  `style-src` keeps `'unsafe-inline'` because inline `style={{…}}` attributes
  are pervasive and CSP nonces don't cover style attributes. Style injection is
  far lower risk than script injection.
- **OG image route** renders public event metadata (title/time/location) for any
  event id without auth by design (link unfurling). Keep it to non-sensitive
  fields only.
- **Legacy public media objects.** Rows created before the private-bucket
  migration still point at public URLs; `signMediaRef` serves them as-is. Run
  `npm run migrate:legacy-media` (dry-run by default; `-- --apply` to execute)
  to copy those objects into `media-private` and rewrite the columns to paths,
  retroactively securing them.
