# Continuous integration

`.github/workflows/ci.yml` runs on pull requests, every push to `main`, and
manual dispatch. Pull request events include `ready_for_review`, so marking a
draft ready starts a new run. New commits cancel only older runs of the same
PR. Main and manual runs keep separate concurrency groups.

## One database stack per revision

The **Authenticated E2E** job starts one local Supabase stack using CLI
`2.116.0`. It applies the repository's migrations and seed, runs every pgTAP
security test, verifies generated types, checks account export/deletion, then
seeds and runs the authenticated browser journeys. pgTAP runs before those
application fixtures; its test transactions roll back.

The former `Database tests` workflow has been removed. Its security checks now
run inside **Authenticated E2E** on every push to `main`, on manual dispatch,
and on pull requests that are ready for review, not opened by Dependabot, and
not limited to documentation. A docs-only pull request is one whose files are
all `*.md` (including `README.md`) or `.github/dependabot.yml`. Draft pull
requests, Dependabot pull requests, and docs-only pull requests still start
the job and report success without running the suite, so a required check does
not stay pending. Changes that do run still use this one stack rather than a
second database workflow. To run database checks manually, dispatch **CI**. A
failed pgTAP step fails **Authenticated E2E** and stops its later steps.

The production migration/parity/deployment workflow remains a separate release
path described in [DEPLOYMENT.md](DEPLOYMENT.md).

## Bound setup work

Disk cleanup checks free space before doing anything: 12 GiB before database
setup and 8 GiB before browser installation. It removes unused toolchains one
at a time until the target is met, preserving the active Node/tool cache.
Deletion is restricted to GitHub Actions Linux runners. Insufficient space
fails visibly instead of continuing into an unrelated browser/database error.

`scripts/ci/start-supabase.mjs` allows 300 seconds total for startup and cleanup,
starting with Supabase's public ECR image mirror. It permits only one GHCR
fallback for a recognized transient download/network failure. SQL, migration,
configuration and unknown failures stop immediately. The service exclusions
are unchanged: Studio, Logflare, Vector, image proxy and Edge Runtime. Both test
suites use the same running stack and the successful image registry.

`npm run test:ci` tests these helpers with isolated command fixtures; it does
not delete local toolchains or start Docker. Hosted CI is still needed to prove
the real migrations, SQL tests and browser journeys against Docker.

## Batch agent pushes

Use local checks during editing and push one complete checkpoint after related
changes are ready. A coordinating agent collects its workers' changes before
pushing a shared branch. Each independent PR should be ready for verification
when pushed. After a failure, read the failing step and fix its cause before
spending another hosted run; use failed-job retries for a cleared transient
outage. Do not disable PR/main checks or add further CI skip markers to save
minutes. Draft, Dependabot, and docs-only skips for Authenticated E2E live in
the workflow itself.

The repository's `AGENTS.md` carries this rule, and `CLAUDE.md` includes it.
