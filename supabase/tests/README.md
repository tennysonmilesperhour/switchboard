# Database tests

pgTAP tests for Switchboard's security invariants. They run against a local
Supabase stack and assert the RLS guarantees the app depends on, so a future
migration can't silently regress them.

## Run

```bash
supabase start          # boots local Postgres + applies migrations
supabase test db        # runs every *.test.sql in this directory via pg_prove
```

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
