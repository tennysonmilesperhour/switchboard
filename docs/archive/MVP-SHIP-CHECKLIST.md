> **Archived 2026-08-11.** Branch-status snapshot from mid-July 2026; Bucket A
> merged. Bucket B's ops items (migrations parity, provider keys, cron plan,
> test-suite runs) are carried forward in [`../DOCKET.md`](../DOCKET.md).

# MVP Ship Checklist — where the code stands, what only you can do

This is the honest state of the app for shipping the first working MVP to the
client. It supersedes the stale status headers in `docs/COMPLETION-PLAN.md` and
`docs/SHIP-READINESS-AUDIT.md` (both dated 2026-07-13, ~a dozen PRs behind).

- **Bucket A — code:** finished in this branch. Listed below with evidence.
- **Bucket B — ops / credentials / your call:** cannot be closed in code. Each
  has exact steps.

Baseline on this branch is green: `npm test` (223 unit tests), `npx tsc
--noEmit`, `npm run lint`, and `npm run build` all pass. `supabase test db`
(pgTAP) needs Docker and was not run in this environment — run it once locally
before release (see Bucket B‑7).

---

## Bucket A — finished in code (this branch)

| Area | What changed |
| --- | --- |
| **Event end time** | Wizard captures an optional end time; event page shows the `start – end` range. `create_event_atomic` already persisted `ends_at`. |
| **Poll vote deadline** | Wizard sets `vote_deadline` (was hardcoded null); the poll-runner cron already resolves by it. |
| **Reminders toggle** | Wizard toggle (default on) → `reminders_enabled` via a new `create_event_atomic` migration. The reminder sweep already honored the column. |
| **Operator: Tune my defaults** | `tune_windows` derives the host's pace from windows they chose on recent plans and biases suggestions. No longer "Soon". |
| **Operator: Capacity nudge** | `capacity_guard` surfaces a gentle review-step heads-up when ≥3 plans stack up in the week ahead. No longer "Soon". |
| **Plan-parser fallback** | "Describe it for me" without an API key now extracts date/time/mode with deterministic rules (was empty). Unit-tested. |
| **Board invite links** | Shareable, moderator-minted, rotatable join links (`/boards/join/[code]`) via security-definer functions. |
| **Room photos** | 📷 in a Living Room uploads + sends a photo inline, filed into a new Photos tab. Makes the empty-state promise real. |
| **Copyright contact** | Real address (`NEXT_PUBLIC_SUPPORT_EMAIL`, default `hello@switchboard.app`) instead of "contact the operator". |
| **/design gating** | 404s on the production deployment; still reachable in dev/preview. |

New migrations to apply (see Bucket B‑1): `20260717120000_event_reminders_toggle`,
`20260717130000_board_invite_links`, `20260717140000_room_photos`.

### Deliberately not built (noted, not silently skipped)

- **`polls.suggest_deadline`** — vestigial. The suggest-and-rank screen is one
  combined phase, so a single `vote_deadline` (now wired) is the only meaningful
  deadline. Safe to drop the column later; left in place to avoid a churn-only
  migration.
- **Board "recurring event" → a real scoped plan.** Board event posts render as
  recurring-open-event *announcements* (cadence + first date + place). Spawning
  a real `events` row from a board post is a genuine feature on the
  design-workshop list (`docs/DOCKET.md`), not a stub — out of scope for this
  pass.
- **Bare `/events` index (404) and unused `venues.url` / `zones.starts_at`.**
  Cosmetic; nothing links to them. Left as-is.

---

## Bucket B — only you (or ops) can close these

### B‑1. Apply the pending DB migrations to production **(release-blocking)**
The audit's #1 blocker was production running behind the committed migrations. I
could not verify current parity — the Supabase project connected to this session
is not the production Switchboard project (`cuzgighqdzypntmhxrqc`).

- Steps: configure the `deploy-migrations` workflow secrets (`SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) so it stops failing closed, then
  let it run on merge — or run `supabase db push --linked` against production.
- Confirm with `supabase migration list --linked` that repo and remote match,
  **including the three new `20260717*` migrations**.
- Then hit `/api/health` with the `CRON_SECRET` bearer and confirm
  `{ ok: true, database: true, schema: true }`.

### B‑2. Configure invite delivery, or set expectations **(product-critical)**
Email (Resend) and SMS (Plivo) return `false` and log `[email:skipped]` when
keys are absent, so guest invites don't actually send. In-app invites to
existing users work regardless.

- Set `RESEND_API_KEY` + `EMAIL_FROM` and/or the `PLIVO_*` vars, or tell the
  client email/SMS delivery is off for the pilot and invite by in-app + shareable
  link only.

### B‑3. Contact-identity verification (safety)
Email/phone are still trusted for matching without proof of ownership
(`profile.ts` lets users set arbitrary contact values). For a small trusted
pilot this is acceptable; before opening matching to strangers, add OTP-verified
contact records. Flagged as P1‑1 in the ship audit.

### B‑4. Set `NEXT_PUBLIC_SUPPORT_EMAIL`
Legal pages now render a real contact; set this to the address the client
actually monitors (defaults to `hello@switchboard.app`).

### B‑5. Cron plan
`vercel.json` schedules `/api/cron/cascade` every minute; Vercel Hobby caps cron
at once/day. Either keep the project on **Pro**, or point an external scheduler
(GitHub Actions / cron-job.org) at the endpoint with the `CRON_SECRET` bearer.
Lazy on-page-load advancement works either way; time-based resolution (poll/vote
deadlines, reminders) needs the sweep to actually fire.

### B‑6. Push notifications (optional)
Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`
(`npx web-push generate-vapid-keys`) to enable push. The service worker is
already registered app-wide; without keys, push simply stays off.

### B‑7. Run the DB + authed test suites once before release
- `supabase test db` (pgTAP security invariants) — needs Docker; not runnable
  in this environment. Run locally to validate the three new migrations and the
  new board-invite / room-photo RLS surfaces.
- The authenticated Playwright suite runs only with `E2E_DB=1` against a seeded
  Supabase; wire it into CI or run it manually against a disposable project.

### B‑8. Seed a demoable environment
`npm run seed:test-profiles` sets `discoverable:true` and is guarded to
localhost. Point it at the demo project (not production) and confirm discovery /
people / mutual render non-empty for the walkthrough.
