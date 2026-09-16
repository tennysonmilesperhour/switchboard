# Database tests

pgTAP tests for Switchboard's security invariants. They run against a local
Supabase stack and assert the RLS guarantees the app depends on, so a future
migration can't silently regress them.

## Run

```bash
supabase start          # boots local Postgres + applies migrations
supabase test db        # runs every *.test.sql in this directory via pg_prove
```

CI runs this suite automatically (`.github/workflows/db-tests.yml`) on every push
to `main` and on any pull request that touches `supabase/`, so a migration that
regresses an invariant fails the build rather than shipping.

## What's covered

`rls_invariants.test.sql`:

- **Anonymity invariant 1** — `poll_votes` are readable only by their author
  (the group sees aggregates via `poll_results()` only).
- **Anonymity invariant 2** — `mutual_intents` are readable only by their author,
  so a target never learns of unrequited interest.
- **C1 (room-membership fix)** — a user cannot insert themselves into a room they
  did not create, and therefore cannot read a private room's messages, expenses,
  or items.
- Positive controls prove the policies allow the legitimate author through, so
  the tests fail if a migration over-restricts as well as if it under-restricts.

The C2 (`reschedule_cancel_event`) and C3 (`respond_to_guest_invite`)
authorization functions are exercised end-to-end by the Playwright suite; add
focused pgTAP coverage for them here when the seed fixtures for events/invites
are expanded.

`launch_hardening.test.sql` verifies that atomic publication and durable rate
limiting are installed and that internal security-definer functions cannot be
executed by anonymous or ordinary authenticated clients.

`authz_hardening.test.sql` locks in the authorization-hardening fixes
(`20260712120000_authz_hardening.sql`): the connection-party and event-host
freeze triggers (F1/F2), the block check on the raw `mutual_intents` write
(F6), and a schema **tripwire** (F8) that fails the moment an authority-like
column (`role`, `is_admin`, `credits`, …) is added to the column-open
`profiles` table without write protection. Positive controls prove the
legitimate accept/edit/insert paths still succeed. See `docs/SECURITY.md`.

`poll_option_details.test.sql` covers editing and removing poll ideas: the
idea's author or the host may, another guest may not, nobody may once the poll
is decided, and an idea can never be re-attributed (`author_id` is frozen).

`thread_replies.test.sql` proves a reply can only answer a comment on the same
plan.

`signal_audiences.test.sql` walks the per-signal audience rule: a named person
sees only the signal naming them, a group member sees only the group signal
(connected or not), a block hides it, a stranger sees nothing, a group the
owner is not in reaches nobody, and the audience arrays are bounded.

`client_feedback.test.sql` covers the app's only unauthenticated write surface.
The assertions are almost all negative, because that is what matters here: RLS
is on with *no policies at all*, so neither `anon` nor a signed-in member can
read a row or write one — only the service role, from the one route that holds
it. It also proves the screenshot bucket is private, and that every length and
count bound is a CHECK rather than only a guard in the route.
