# Switchboard ChatGPT 5.5 Prompt Map

This is an execution map for taking Switchboard from commit `ef77d94` to a controlled user pilot. It is intentionally sequenced: finish a prompt, review its evidence, and commit it before moving to the next prompt.

The source audit is `docs/SHIP-READINESS-AUDIT.md`. Treat it as the factual baseline, but recheck external state at the start of every session because deployments, migrations, provider settings, and dependencies can change.

`docs/COMPLETION-PLAN.md` is a useful supplemental feature backlog. Where it
conflicts with this map or the ship-readiness audit, follow this map and the
owner's latest direction. In particular, email and SMS invitations are part of
the required product behavior and may not be excluded from release readiness.

## Current execution status (2026-07-13)

An uncommitted implementation pass in the audit author's workspace addresses migration fail-closed behavior,
public join routing, verified contacts, truthful provider-attempt recording,
isolated authenticated CI, microphone policy, structured errors, seed guards,
and the audited public accessibility issues. Do not assume those changes are in
your checkout; verify the current branch and diff first. That pass does **not**
make the map complete. Production still has nine pending migrations; provider webhooks and
bounded idempotent retries, full media/auth/contact browser journeys, external
provider staging checks, live advisor closure, preview isolation, and pilot
operations remain open. Re-run each prompt's acceptance criteria rather than
assuming completion from the presence of code.

## Operating rules

Paste the **Session preamble** first, then one numbered prompt. Do not give an agent the entire map as one implementation request.

- Prompts 1-5 are release blockers and must remain in order.
- Prompts 6-10 can be reordered only after prompts 1-5 are green.
- Prompts 11-14 are hardening and product work after behavior is protected.
- One pull request per prompt is preferred.
- Never place secrets in source, logs, screenshots, chat output, or commits.
- Use a Supabase migration for every schema, grant, policy, function, trigger, or bucket change.
- Test migrations in an isolated Supabase branch/project before production.
- Do not deploy, push migrations, rotate credentials, delete production data, or push Git changes without explicit authorization for that external action.
- Stop when a required secret, provider-domain decision, legal decision, or destructive production operation needs the owner.
- Do not call a feature complete because a component exists. Prove the full browser-to-provider/database-to-browser journey.

## Dependency map

| ID | Priority | Depends on | Outcome |
| --- | --- | --- | --- |
| 1 | P0 | None | Honest migration CI and production schema parity |
| 2 | P0 | 1 | Public invitation links work for signed-out recipients |
| 3 | P0 | 1 | Email/SMS delivery is configured, recorded, and truthful |
| 4 | P0 | 1-3 | Verified email/phone identity for matching and routing |
| 5 | P0 | 1-4 | Required authenticated end-to-end release suite |
| 6 | P1 | 1, 5 | Image and voice media work privately on real browsers |
| 7 | P1 | 1, 4, 5 | RLS/function/storage security hardening |
| 8 | P1 | 1-5 | Actionable observability, health, and release checks |
| 9 | P1 | 4, 5 | Complete password and Google authentication behavior |
| 10 | P1 | 1-9 | Correct preview, production, rollback, and release operations |
| 11 | P2 | 5 | Accessible, product-specific public and navigation UI |
| 12 | P2 | 5 | Smaller feature modules and tested Server Actions |
| 13 | P2 | 5, 12 | Dead-code cleanup and new-developer documentation |
| 14 | P3 | 1-13 | Controlled pilot and evidence-led innovation track |

## Session preamble

```text
You are working on Switchboard in this repository. Act as a senior Next.js, React, Supabase, security, and product engineer.

Before changing anything:
1. Read AGENTS.md if present, PRODUCT.md, README.md, docs/SECURITY.md, docs/SHIP-READINESS-AUDIT.md, and the files named by this prompt.
2. Run git status and preserve all existing user changes. Never revert work you did not create.
3. Fetch remote state and confirm which commit/branch you are reviewing, but do not pull, push, deploy, migrate production, rotate credentials, or modify an external service unless I explicitly authorize that action.
4. Inspect the current implementation and verify every claim in the prompt. External state may have changed since the audit.
5. Follow existing patterns and keep changes narrowly scoped. Avoid broad rewrites.

Engineering requirements:
- Use structured validation and typed data boundaries.
- Use new, forward-only Supabase migrations. Never edit an applied migration.
- Preserve RLS and least privilege. Test positive and negative authorization cases.
- Never expose a service-role key to browser code.
- Return honest, actionable error states to users without leaking internals.
- Add tests at the lowest useful level plus browser coverage for the user journey.
- Run npm run lint, npm test, npm run build, and relevant Playwright/pgTAP checks.
- Update documentation when behavior, configuration, or operations change.
- Report changed files, verification output, residual risks, and any manual operator steps.
- Do not claim completion if a required test was skipped.

Ask for owner input only when it cannot be discovered safely and a wrong assumption would change security, cost, legal obligations, or production data. Otherwise proceed with conservative decisions.
```

## Prompt 1: Restore database and deployment integrity

```text
Objective: make database deployment fail honestly, bring the intended environment to schema parity, and prevent application code from deploying against an older schema.

Audit facts to recheck:
- .github/workflows/deploy-migrations.yml exits 0 when Supabase secrets are missing.
- Production was missing migrations 20260711121000, 20260711130000, 20260712120000, 20260712130000, and 20260713120000.
- Deployed code already reads events.time_zone and expects new RPCs/private media.
- src/app/api/health/route.ts only probes profiles.id, handle, and contact_email.

Implement:
1. Change migration CI on main to fail closed when any required secret is absent. Add a clear preflight that names missing secret names without printing values.
2. Add a migration-parity check suitable for CI/release promotion. A green release must prove no committed migration is pending.
3. Expand authenticated health diagnostics to verify the latest required columns/functions/storage contract without mutating data. Prefer one versioned schema sentinel or migration ledger check over a growing pile of fragile probes.
4. Add a post-deploy verification step that checks the deployed build ID, Supabase project ref, schema readiness, and health status.
5. Document exact GitHub secret names and the safe operator procedure in docs/DEPLOYMENT.md.
6. Test all five pending migrations on an isolated Supabase branch/project, including pgTAP and advisors.

External stop point:
- If production still lacks the migrations, show the dry run and ask for explicit permission immediately before applying them.
- If repository secrets are absent, provide the exact owner steps and stop. Never invent or echo values.

Acceptance criteria:
- Missing migration secrets make the GitHub job fail.
- A no-op migration deployment is distinguishable from a successful applied deployment.
- Repository and target migration lists match after authorized deployment.
- Health returns non-200 for schema drift and never exposes secrets publicly.
- pgTAP, lint, unit tests, build, and a production smoke check pass.
- A rollback/forward-fix note exists for each migrated feature.
```

## Prompt 2: Repair the public invitation journey

```text
Objective: a person receiving a shareable plan URL must be able to inspect the permitted invitation context, create or sign into an account, return to the same URL, request access, and receive a clear result.

Inspect:
- src/proxy.ts
- src/app/join/[id]/page.tsx
- src/app/join/[id]/JoinViaLinkClient.tsx
- login/signup redirect handling
- request/approval Server Actions and RLS policies

Implement:
1. Treat /join and only its intended descendants as public in the proxy.
2. Preserve a validated same-origin return path through sign-in, account creation, password recovery where practical, and onboarding. Prevent open redirects.
3. Define and implement states for invalid link, sharing disabled, plan closed, signed-out, signed-in eligible, already requested, already invited, host/cohost, approved, and rejected.
4. Ensure the public query reveals only the minimum fields intentionally shared by the host.
5. Add abuse controls for repeated join requests and avoid account enumeration.
6. Add unit tests for return-path validation and Playwright tests for the complete signed-out and signed-in flows.

Acceptance criteria:
- GET /join/<uuid> does not redirect a signed-out visitor to /welcome.
- Signed-out CTA returns to the original join URL after authentication/onboarding.
- A valid request reaches the host and host approval gives the requester normal event access.
- Non-shareable or closed plans disclose no private plan details.
- Invalid/expired links render a stable, useful state.
- Tests cover mobile and desktop and run in CI, not behind an unset flag.
```

## Prompt 3: Make invitation delivery real and truthful

```text
Objective: email, SMS, and in-app invitations have explicit delivery state, safe retries, and provider-backed evidence. The UI must never say an invitation was sent when delivery was skipped.

Inspect all invite creation paths, provider wrappers, notification records, event creation, resend actions, and deployment environment requirements.

Design first:
- Define one delivery-attempt model with channel, recipient reference, provider, provider message ID, idempotency key, state, timestamps, retry count, safe error code, and event/invite linkage.
- Separate invitation creation from channel delivery. A plan may be created even when a provider is unavailable, but the user must see exactly what happened.

Implement:
1. Integrate configured Resend email and Plivo SMS providers using server-only credentials.
2. Add provider webhooks with signature verification, idempotency, replay protection, and state transitions for queued/sent/delivered/failed where supported.
3. Make retries idempotent and bounded. Never create duplicate invitations or send an uncontrolled duplicate message.
4. Return recipient-level outcomes from plan publication and resend actions.
5. Present in-app delivery status and a retry action to authorized hosts/cohosts.
6. Keep in-app notification delivery independent of external provider success.
7. Add provider adapters/fakes for deterministic tests; keep one explicit staging acceptance test against each real provider.
8. Document DNS/domain/number verification, webhook URLs, environment names, and provider dashboards.

External stop point:
- Ask the owner to configure or authorize provider accounts, sending domain/from address, phone number, and webhook secrets. Never place those values in source.

Acceptance criteria:
- Missing provider configuration produces a visible not-sent/needs-setup state, not success.
- Valid email and phone invitations are observed in provider staging logs and status returns through signed webhooks.
- A failed recipient does not roll back a successfully created plan or hide successful recipients.
- Retries cannot double-send under concurrent requests.
- Logs and UI redact addresses/numbers appropriately.
- Unit, integration, and browser tests cover success, partial failure, total outage, retry, and webhook replay.
```

## Prompt 4: Verify contact identity before matching or routing

```text
Objective: usernames remain immediately usable, but email addresses and phone numbers affect friend discovery, contact matching, invitations, and account recovery only after ownership verification.

Current risks to recheck:
- createPasswordAccount uses the admin API with email_confirm: true.
- profile editing accepts arbitrary contact_email/contact_phone.
- contact resolution can match those values to accounts and invitations.

Implement with a forward migration:
1. Model user identifiers separately from display/profile data. Include type, normalized value, verification state/time, primary flag, privacy/discoverability controls, and uniqueness rules for verified values.
2. Use Supabase email verification/OTP for real email usernames and a reputable SMS OTP flow for phone verification. Rate-limit sends and attempts; hash or otherwise protect verification state.
3. Keep synthetic username auth emails internal and never treat them as contact addresses.
4. Only verified identifiers may resolve contacts, attach pending invitations to an account, or appear as an account match.
5. Migrate existing contact values as unverified. Do not silently trust legacy data.
6. Handle identifier transfer, duplicate claims, account recovery, deletion, and provider delivery failure safely.
7. Prevent account enumeration in all verify, search, recovery, and add-friend responses.
8. Update privacy copy and settings so users understand matching/discoverability consequences.

Acceptance criteria:
- A user cannot claim another person's email/phone for routing merely by editing a profile.
- Verified email OR username can sign in as intended.
- Pending phone/email invitations attach to the account only after that same identifier is verified.
- Search results honor privacy/discoverability settings and reveal minimal data.
- Positive, negative, duplicate, expired-code, rate-limit, and transfer cases have tests.
- Existing users get a clear verification path without losing username access.
```

## Prompt 5: Build the required authenticated release suite

```text
Objective: make the core Switchboard promise executable in CI from browser through database and back. No release-critical browser test may be silently skipped.

Implement:
1. Provision an isolated test Supabase project/branch or a reproducible local Supabase stack in CI. Apply all migrations from zero.
2. Replace shared/static production-capable fixture passwords with generated CI-only secrets. Add an explicit guard that refuses to seed production project refs.
3. Make fixture creation and cleanup deterministic and idempotent.
4. Run authenticated Playwright tests as a required GitHub check.
5. Replace the invalid! sign-in case with a valid-shaped unknown username/email and wrong password so it exercises the real backend failure path.
6. Add critical journeys:
   - create account, accept community commitment, onboard, sign out, sign in by username, sign in by email
   - wrong password returns feedback and re-enables submit
   - host creates/publishes plan with friend, handle, email, and phone recipients
   - signed-out invite recipient authenticates and returns to invite
   - guest RSVP and account-linked RSVP
   - host receives request/response and approves where required
   - edit/cascade behavior and authorization boundaries
   - image upload/view/delete and voice upload/playback
   - friend request, contact matching with verified identifiers, block/report/privacy boundaries
7. Use provider fakes for normal CI and a separately triggered staging provider check.
8. Upload traces/screenshots only on failure and ensure they contain no service keys or unnecessary personal data.

Acceptance criteria:
- CI fails if authenticated tests are skipped, fixtures are absent, migrations drift, or the app points at the wrong test project.
- Tests pass from a clean environment with documented commands.
- At least one negative authorization assertion accompanies each sensitive positive journey.
- Plan publication and invite response are tested at browser, API/action, and database levels.
```

## Prompt 6: Finish private image and voice media

```text
Objective: every image/audio upload surface uses the intended private/public storage policy, gives useful progress/failure feedback, and works on supported mobile browsers.

Inspect all upload components, URL validators, private media route, storage buckets/policies, cleanup behavior, and next.config.ts Permissions-Policy.

Implement:
1. Inventory every avatar, profile cover, plan cover, room attachment, and voice-note upload path. Document bucket, object path, size/type limits, visibility, and deletion owner.
2. Permit microphone access from self only where required while keeping camera/geolocation denied unless a feature explicitly needs them.
3. Enforce file signature/type, size, ownership, randomized object names, and least-privilege storage policies server-side.
4. Use private/signed delivery for sensitive event/room media. Keep genuinely public profile media in explicitly public buckets.
5. Handle upload progress, cancellation, retry, permission denial, unsupported browser, interrupted upload, playback failure, and cleanup of replaced/orphaned objects.
6. Add a safe migration/backfill plan for legacy public media before disabling old access.
7. Test Chrome and mobile Safari behavior, including microphone permission states.

Acceptance criteria:
- Plan cover upload, avatar/cover upload, and voice recording/upload/playback pass end to end.
- Unauthorized users cannot list, read, overwrite, or delete private objects.
- Deleting/replacing content removes or schedules cleanup of obsolete objects.
- Permissions Policy allows the intended voice feature and nothing broader.
- Upload failures never discard the user's surrounding form state.
```

## Prompt 7: Close Supabase authorization and advisor findings

```text
Objective: reduce the live Supabase security advisor to an explicitly accepted, documented set and prove least privilege with pgTAP.

Start by applying Prompt 1 to an isolated branch, then fetch fresh security and performance advisors. Do not blindly encode the old counts.

Implement forward migrations for verified findings:
1. Revoke anon/authenticated execution on SECURITY DEFINER functions unless the role truly needs direct access. Grant the narrowest valid role and schema usage.
2. Set immutable safe search_path values on privileged functions and schema-qualify object references.
3. Tighten storage bucket listing and object policies.
4. Add explicit WITH CHECK clauses to update policies where the intended post-update invariant is not already guaranteed.
5. Consolidate genuinely redundant permissive policies without changing intended access.
6. Enable leaked-password protection in Supabase Auth through an authorized operator step.
7. Optimize auth.uid()/auth.jwt() RLS calls with select wrappers where appropriate, measuring plans before and after.
8. Add pgTAP cases for requester/addressee mutation, host ownership, cohost authority, room membership, invite visibility, private media, blocked users, and privileged RPC grants.

Acceptance criteria:
- No anon role can execute an internal SECURITY DEFINER mutation unless justified by an explicit public protocol and covered by abuse tests.
- Known connection, event host, and room membership escalation cases fail.
- Every remaining advisor warning has an owner, rationale, and review date.
- RLS tests run in CI from a clean migrated database.
```

## Prompt 8: Add release-grade health and observability

```text
Objective: operators can detect schema drift and failures in auth, plan publication, delivery, uploads, and scheduled work before users report them.

Implement:
1. Replace String(error) serialization with safe structured extraction for Error, Supabase/PostgREST errors, provider errors, and unknown values. Redact tokens, secrets, passwords, message bodies, and unnecessary personal data.
2. Include request/correlation ID, build ID, schema version, area, safe error code, and relevant entity IDs.
3. Configure one supported production error/alert destination and define alert thresholds for auth failure spikes, invite delivery failures, upload failures, cron failures, and schema mismatch.
4. Expand authenticated health checks to cover database/schema, storage contract, cron secret, and release-required providers. Mark optional providers explicitly instead of folding them into ambiguous success.
5. Add a protected readiness endpoint and keep public liveness coarse.
6. Verify the cascade cron uses authentication, idempotency, overlap protection, bounded work, and structured run summaries.
7. Add synthetic checks for welcome, login, health, and a non-mutating authenticated path.
8. Write an incident/rollback runbook with owners and first diagnostic commands.

Acceptance criteria:
- Supabase errors retain code/message/details without leaking sensitive values.
- A forced staging failure reaches the configured alert destination with build/schema correlation.
- Readiness fails on pending migration or missing release-required provider.
- Alerts are actionable and do not fire on expected user validation errors.
- Cron failures and stale runs are visible.
```

## Prompt 9: Complete authentication behavior

```text
Objective: every displayed authentication option works or is deliberately hidden, and every failure leaves the interface usable with clear feedback.

Inspect password account creation, username/email lookup, reset, logout, session refresh, Google OAuth, rate limits, and return paths.

Implement:
1. Surface errors returned by Supabase OAuth and redirect/callback handling. Never leave the Google button in an indefinite pending state.
2. Show Google sign-in only when the provider is intentionally configured, or provide an explicit unavailable state in non-production diagnostics.
3. Add a submission timeout/recovery path for network hangs while avoiding duplicate account/login requests.
4. Ensure password errors are generic enough to prevent account enumeration but specific enough to tell the user the attempt failed.
5. Test username, verified email, wrong password, unknown account, disabled provider, callback error, expired session, reused refresh token, reset link, and rate limits.
6. Confirm session cookies, redirect allow lists, PKCE/state handling, and production callback URLs.

Acceptance criteria:
- Every auth button reaches success or visible failure within a bounded time.
- Submit controls re-enable after all failure paths.
- OAuth configuration is documented for local, preview, and production.
- Browser tests exercise real valid-shaped backend failures.
```

## Prompt 10: Make preview and release operations trustworthy

```text
Objective: a preview is a safe, complete rehearsal of production, and releases have explicit promotion and rollback gates.

Implement/document:
1. Confirm the canonical Vercel project and remove or archive accidental duplicate projects only after owner approval.
2. Give preview a complete isolated backend configuration. Do not point arbitrary previews at production Supabase or production provider credentials.
3. Define environment ownership for local, CI, preview, staging/provider test, and production.
4. Validate required environment variable names without printing values. Fail build/readiness for missing required values in the applicable environment.
5. Add release ordering: migrate compatible schema, deploy code, verify, then remove deprecated schema in a later release.
6. Add deployment protection, required checks, rollback procedure, and a post-release smoke script.
7. Pin/document Node, package manager, and Supabase CLI versions used by CI.
8. Review the per-minute cascade cron for plan limits, cost, and concurrency.

Acceptance criteria:
- Preview can run the authenticated release suite against non-production data.
- Production and preview report distinct expected Supabase refs.
- No environment is half configured with a service-role key but no public client configuration.
- A release cannot be promoted with failed migrations, readiness, or core E2E.
- Rollback is tested without rolling schema backward destructively.
```

## Prompt 11: Accessibility and product-specific UI polish

```text
Objective: resolve the audited accessibility failures and make the public surface demonstrate Switchboard rather than describe it with generic feature cards.

Use the existing design system and PRODUCT.md. Do not redesign authenticated workflows before observing them in real use.

Implement:
1. Add a main landmark to welcome and preserve semantic heading order.
2. Fix automated contrast failures for footer, separator, and forgot-password text using shared tokens.
3. Increase pointer/touch hit areas to at least 44x44 CSS pixels for public links/tabs without oversized typography.
4. Replace the custom More sheet with an accessible dialog/sheet primitive or fully implement focus trap, initial focus, Escape, close control, inert background, and focus return.
5. Replace welcome gradient text, emoji-led claims, and repetitive cards with a concise product-specific view of a real create/invite/respond planning loop. Avoid a marketing-only hero.
6. Improve desktop use of space while preserving the no-overflow mobile layout.
7. Align manifest colors, add robots.txt, and fix Open Graph font/glyph errors.
8. Run axe, keyboard-only checks, screen-reader landmarks, reduced motion, 320/390/768/1440 viewports, and Lighthouse.

Acceptance criteria:
- No serious/critical axe issues on welcome, login, navigation, plan wizard, event, profile, people, and settings.
- All dialogs/sheets pass keyboard focus tests.
- Audited text meets WCAG AA contrast.
- Public mobile controls meet target size and no viewport has horizontal overflow.
- Lighthouse accessibility is at least 98 on welcome and login, with documented exceptions.
```

## Prompt 12: Refactor high-complexity modules safely

```text
Objective: make the code understandable to a new developer without changing behavior. Work one module at a time and require characterization tests first.

Order:
1. EventWizard
2. EventPage
3. PeopleClient
4. src/lib/actions/events.ts
5. loadMyIdentity and profile data assembly

For each module:
1. Write characterization tests for current state transitions, validation, authorization, query results, and error behavior.
2. Separate server data assembly from presentation and client interaction.
3. Extract cohesive feature components/hooks/modules, not arbitrary line-count fragments.
4. Give EventWizard one typed state model/reducer and explicit step definitions. Keep one final submission boundary.
5. Give EventPage one typed view model and independent sections with minimal props.
6. Split People into Friends, Contacts, Discovery, and Matches capabilities with shared identity primitives.
7. Split event actions into lifecycle, invite/participant, scheduling/poll, and venue modules while preserving exported call sites.
8. Add direct tests for every authorization-sensitive Server Action and its expected revalidation/redirect behavior.
9. Measure bundle size, complexity, and test runtime before/after. Avoid abstraction that only moves code.

Acceptance criteria:
- No user-facing behavior or data contract changes without an explicit migration/product decision.
- Critical E2E remains green after every module.
- Files have clear ownership and imports do not create circular feature dependencies.
- A new architecture note explains route, feature, action, data, and provider boundaries.
- Complexity materially decreases while duplication remains low.
```

## Prompt 13: Remove dead code and repair developer documentation

```text
Objective: make the repository's visible surface truthful and navigable for a developer on day one.

Implement:
1. Verify and remove the unused settings SaveButton component.
2. Manually validate every knip unused export/type result before removal. Account for route loading, service-worker string paths, scripts, tests, and framework conventions.
3. Remove unreferenced default Next assets after repository and generated-reference checks.
4. Update README with current architecture, features, setup, environment categories, migrations, test commands/count expectations, E2E requirements, provider setup links, and deployment flow.
5. Replace or mark the old docs/AUDIT-AND-HANDOFF.md as historical and link to the current audit.
6. Reconcile docs/DOCKET.md so shipped, blocked, planned, and exploratory items are unambiguous.
7. Reconcile docs/SECURITY.md media/contact wording with the final verified identity and private-media design.
8. Add a new-developer architecture map: request/auth path, core entities, RLS ownership, Server Actions, external providers, cron, notifications, and test layers.
9. Add a short decision log for non-obvious choices such as synthetic username auth emails, public vs private media, and invite identity routing.

Acceptance criteria:
- Fresh clone setup is reproducible from docs without tribal knowledge.
- All documented commands work.
- knip/jscpd results are understood and remaining exceptions are configured or documented.
- No stale document claims a feature/test/deployment state contradicted by source or CI.
- Lint, unit, build, and E2E remain green after cleanup.
```

## Prompt 14: Run the pilot and choose innovation from evidence

```text
Objective: ship a controlled pilot of the trustworthy core loop, learn where coordination fails, and only then expand discovery/matching features.

Pilot prerequisites:
- Every release-gate checkbox in docs/SHIP-READINESS-AUDIT.md is satisfied or has a written owner-approved exception.
- Legal/privacy/community language has owner/counsel approval.
- Reporting, blocking, account deletion, data export/retention, incident response, and moderation escalation are usable.

Implement the pilot:
1. Put higher-risk discovery, anonymous matching, geographic matching, and experimental AI behind server-evaluated feature flags.
2. Invite a small diverse cohort with clear support and feedback channels.
3. Instrument privacy-respecting funnel events: account created, plan drafted, plan published, invite channel attempted, delivered, opened, response recorded, plan confirmed, and failure reason. Never record message content or raw contacts as analytics.
4. Create operator dashboards for delivery failure, invite conversion, plan completion, abuse reports, blocks, and support incidents.
5. Define pilot success and stop criteria before launch.
6. Run structured interviews about where users hesitated, misunderstood delivery, felt social pressure, or needed context.

Innovation decision after the pilot:
1. Rank opportunities by user evidence, safety burden, operational cost, and fit with PRODUCT.md.
2. Prefer improvements to the known-people planning loop before expanding acquisition mechanics.
3. For discovery/mutual matching, require explicit context, mutual opt-in, bounded visibility, block/report controls, coarse location by default, no protected-trait targeting, and no notification unless mutual consent exists.
4. Prototype one narrowly scoped context such as finding a hiking companion, with safety review and an expiration window.
5. Test the prototype behind a flag and compare it against a predeclared success/safety threshold.

Acceptance criteria:
- The pilot completes monitored create-invite-deliver-respond-confirm journeys.
- Operators can tell whether a failure is product, database, provider, or user input.
- No higher-risk matching feature launches without safety requirements and explicit consent semantics.
- The next roadmap is based on observed behavior and interviews, not feature volume.
```

## Final ship review prompt

Use this only after Prompts 1-14 are complete or explicitly deferred by the owner.

```text
Perform a clean-room release review of Switchboard. Do not rely on prior completion claims.

1. Start from a fresh clone and follow README setup exactly.
2. Compare local, GitHub, Vercel, and Supabase commit/build/project/migration identity.
3. Run lint, unit tests, build, pgTAP, authenticated Playwright, provider staging checks, axe, Lighthouse, dependency audit, knip, and migration dry run.
4. Execute the full release gate in docs/SHIP-READINESS-AUDIT.md and attach evidence for every checkbox.
5. Review all security/privacy boundaries: RLS, privileged functions, storage, verified identifiers, secrets, logs, blocking/reporting, deletion, and legal acknowledgements.
6. Test one real staging email and SMS invitation, one in-app invitation, one public join request, one guest RSVP, one image, and one voice note.
7. Confirm alerts, cron, health/readiness, provider webhooks, backups, rollback, and support ownership.
8. Report findings first in P0-P3 order with exact file/route/migration references. Do not fix findings during the independent review.
9. End with an explicit GO, CONDITIONAL GO, or NO-GO and list the evidence supporting that decision.

A green build alone is not a GO. Any skipped core test, schema drift, false delivery state, unverified identity-routing path, or unresolved authorization escalation is a NO-GO.
```
