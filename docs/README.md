# Docs index

Living docs are kept true as the code changes: if a change affects behavior
they describe, update the owning document in the same PR. Point-in-time plans,
audits, and verification artifacts move to `archive/` when finished. Archived
files are historical evidence, never a source of current product truth.

## Living docs

| Doc | What it is |
|---|---|
| [`README.md`](README.md) | This complete index of the `docs/` tree. |
| [`SECURITY.md`](SECURITY.md) | Security precedents. Read before touching auth, RLS, `createAdminClient()`, uploads, redirects, or untrusted text. |
| [`AUTH.md`](AUTH.md) | Account-access invariants for sign-in, sign-up, recovery, and onboarding. |
| [`CLIENT-FEEDBACK-LOOP.md`](CLIENT-FEEDBACK-LOOP.md) | The checklist's feedback box and the twice-daily job that works it: what may merge unattended, and what always waits for a person. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | How the app and database ship; env vars, cron, and moderators. |
| [`CI.md`](CI.md) | Shared database tests, bounded setup, and agent push batching. |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | The shipped visual system: tokens, type, and component conventions. |
| [`NAMING.md`](NAMING.md) | Canonical user-facing names and the decisions behind them. |
| [`analytics.md`](analytics.md) | Every tracked analytics event and the anonymity guardrail. |
| [`DOCKET.md`](DOCKET.md) | The living backlog: strategy, queued builds, design threads, and carried residuals. |
| [`INNOVATIONS.md`](INNOVATIONS.md) | Unshipped ideas only; shipped features are removed. |
| [`POSTHOG_SOURCEMAPS.md`](POSTHOG_SOURCEMAPS.md) | How to upload production source maps to PostHog and verify the result. |
| [`scope-of-work-verification.html`](scope-of-work-verification.html) | The client-facing verification checklist, served live at `/scope-verification`. Add a section per delivered round. |

## Archive

| File | Historical purpose |
|---|---|
| [`archive/AUDIT-AND-HANDOFF.md`](archive/AUDIT-AND-HANDOFF.md) | Earlier codebase audit and handoff. |
| [`archive/CHATGPT-5-5-PROMPT-MAP.md`](archive/CHATGPT-5-5-PROMPT-MAP.md) | Prompt-to-work map for an earlier implementation pass. |
| [`archive/CLIENT-FEEDBACK-PLAN.md`](archive/CLIENT-FEEDBACK-PLAN.md) | First client-feedback implementation plan. |
| [`archive/CLIENT-FEEDBACK-2-PLAN.md`](archive/CLIENT-FEEDBACK-2-PLAN.md) | Second client-feedback implementation plan. |
| [`archive/CLIENT-FEEDBACK-3-PLAN.md`](archive/CLIENT-FEEDBACK-3-PLAN.md) | Third client-feedback implementation plan. |
| [`archive/COMPLETION-PLAN.md`](archive/COMPLETION-PLAN.md) | Historical completion plan. |
| [`archive/DEMO-MVP-SCOPE-CHECKLIST.md`](archive/DEMO-MVP-SCOPE-CHECKLIST.md) | Demo/MVP scope checklist. |
| [`archive/DESIGN-DIRECTIONS.md`](archive/DESIGN-DIRECTIONS.md) | Superseded visual-direction exploration. |
| [`archive/MVP-SHIP-CHECKLIST.md`](archive/MVP-SHIP-CHECKLIST.md) | MVP release checklist. |
| [`archive/PARTIFUL-GAPS.md`](archive/PARTIFUL-GAPS.md) | Point-in-time Partiful comparison. |
| [`archive/AUDIT-2026-09-01.md`](archive/AUDIT-2026-09-01.md) | September 1 code, UX, security, vision, and delivery baseline at `f68181e`; its numbered remediation is complete. |
| [`archive/REMEDIATION-PLAN-2026-09-01.md`](archive/REMEDIATION-PLAN-2026-09-01.md) | Completed 21-item work order from the September 1 audit; dashboard-only residuals live in `DOCKET.md`. |
| [`archive/SHIP-READINESS-AUDIT.md`](archive/SHIP-READINESS-AUDIT.md) | Earlier ship-readiness audit. |
| [`archive/WEEKLY-PLAN-2026-08-11.md`](archive/WEEKLY-PLAN-2026-08-11.md) | Completed six-item weekly plan. |

## Historical specs

| File | Historical purpose |
|---|---|
| [`superpowers/specs/2026-07-03-switchboard-v1-design.md`](superpowers/specs/2026-07-03-switchboard-v1-design.md) | Original v1 design and data-model specification. |

## Load-bearing sources outside `docs/`

- [`../AGENTS.md`](../AGENTS.md) — agent operating manual.
- [`../PRODUCT.md`](../PRODUCT.md) — product principles and anti-references.
- [`../src/lib/features.ts`](../src/lib/features.ts) — the only catalogue of
  what ships, rendered at `/features` and enforced by test.
- [`../src/lib/errors.ts`](../src/lib/errors.ts) — operational error registry.

## Where things go

- **Work not yet done** → `DOCKET.md` (near-term, decided) or `INNOVATIONS.md`
  (uncommitted ideas). A dated plan may expand on docket work while active.
- **A finished plan, audit, or checklist** → `archive/`, with a banner and any
  remaining work carried into `DOCKET.md` first.
- **Behavior documentation** → the living doc that owns it, updated in the same
  PR as the change.

- [SMS purpose, current behavior, and repair notes](SMS.md)
