# Docs index

Two kinds of documents live here. **Living docs** are kept true as the code
changes — if you change behavior they describe, update them in the same PR.
**`archive/`** holds point-in-time plans and audits that were executed or
superseded; they are history, never a source of truth, and each opens with a
banner saying what happened to it.

## Living docs

| Doc | What it is |
|---|---|
| [`SECURITY.md`](SECURITY.md) | The security precedents. Read before touching auth, RLS, `createAdminClient()`, uploads, redirects, or untrusted text. |
| [`AUTH.md`](AUTH.md) | The account-access invariants. Read before touching sign-in, sign-up, recovery, or onboarding. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | How the app and database ship; env vars, cron, moderators. |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | The design system as shipped — tokens, type, component conventions. |
| [`NAMING.md`](NAMING.md) | What things are called, where each name appears, and the decision behind it. |
| [`analytics.md`](analytics.md) | Every tracked event and why; the anonymity guardrail. |
| [`DOCKET.md`](DOCKET.md) | The living backlog: strategy, queued builds, design threads, and residuals carried forward from archived docs. |
| [`INNOVATIONS.md`](INNOVATIONS.md) | The idea list. Roadmap entries live here, never in the feature index. |
| [`WEEKLY-PLAN-2026-08-11.md`](WEEKLY-PLAN-2026-08-11.md) | The current week's plan. Superseded weekly plans move to `archive/`. |

Also load-bearing but not in `docs/`: [`../AGENTS.md`](../AGENTS.md) (the agent
operating manual), [`../PRODUCT.md`](../PRODUCT.md) (product principles and
anti-references), `src/lib/features.ts` (the user-facing feature catalogue,
rendered at `/features` and enforced by test), and `src/lib/errors.ts` (every
operational error code).

## Where things go

- **Work not yet done** → `DOCKET.md` (near-term, decided) or `INNOVATIONS.md`
  (ideas). A dated weekly plan may expand on docket items.
- **A finished pass or audit** → write-ups move to `archive/` once executed,
  with a banner and their open items carried into `DOCKET.md` first.
- **Behavior documentation** → the living doc that owns it, updated in the same
  PR as the change.

`superpowers/specs/` holds dated design specs (historical by convention).
