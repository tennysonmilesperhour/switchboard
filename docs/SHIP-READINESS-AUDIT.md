# Switchboard Ship-Readiness Audit

- **Audit date:** 2026-07-13
- **Repository:** `tennysonmilesperhour/switchboard`
- **Audited commit:** `ef77d94` (`main`, synchronized with `origin/main`)
- **Production app:** `https://switchboard-hqk2.vercel.app`
- **Production Supabase project:** `cuzgighqdzypntmhxrqc`

## Executive verdict

**Release status: NO-GO.** The source code builds cleanly and the public surface is stable, but production has several release-blocking gaps:

1. Production is missing five committed database migrations while the deployed code already relies on them.
2. The database deployment workflow reports success when its secrets are absent and no migration was applied.
3. Public plan invite links redirect signed-out recipients away from the join page.
4. Email and SMS providers are not configured, but invitation creation does not clearly report non-delivery.
5. User-provided email addresses and phone numbers can participate in identity matching without ownership verification.
6. The global Permissions Policy disables the microphone used by the voice-note feature.
7. Authenticated end-to-end tests are skipped in normal CI, including the plan creation and invitation flow.

The app should not be described as bug-free or fully implemented until these items are resolved and the release gate in this document passes.

### Implementation update: 2026-07-13

An initial release-blocker implementation pass exists as uncommitted local work
in the audit author's workspace. A different checkout or GitHub branch may not
contain it, so verify the source rather than assuming these changes are present:

- Migration CI fails closed, pins Supabase CLI, and checks parity after push.
- Readiness uses a versioned schema sentinel and checks private storage plus required delivery providers.
- `/join` is public, preserves a validated authentication return path, and has browser coverage.
- Invitation attempts now record in-app/email/SMS outcomes and expose failures to hosts.
- Profile email/phone matching requires verified contact rows; email signup confirms ownership and phone verification uses expiring codes.
- Authenticated E2E has an isolated Supabase CI job and generated fixture credentials.
- Voice recording is allowed for same-origin use, operational errors retain safe structured fields, and the public accessibility/SEO findings were addressed.

Current local verification: lint passes; 25 test files and 186 tests pass; the
production build passes with 38 generated routes; all 16 public Playwright
checks pass across mobile and desktop; workflow YAML and `git diff --check`
pass. Docker is unavailable on this workstation, so the new clean-database
pgTAP and authenticated E2E jobs have not run locally.

The read-only production dry run now reports **nine** pending migrations: the
five listed in the original audit plus `20260713130000`, `20260713131000`,
`20260713150000`, and `20260713151000`. Production remains **NO-GO** until those
migrations are tested and applied with authorization, GitHub/Vercel/provider
secrets are configured, the new CI jobs pass, provider staging delivery and
webhook/retry behavior are completed, and the external release-gate items are
verified. This update records local implementation, not production activation.

### Closeout update: 2026-07-17

This pass worked from `origin/main` and added the remaining source-side ship
readiness wiring:

- Authenticated Playwright now has a dedicated GitHub Actions job that boots a
  local Supabase stack, exports non-production fixture env, seeds deterministic
  users, sets `E2E_DB=1`, and runs `e2e/authed.spec.ts`.
- `e2e/seed.mjs` now refuses production, sets seeded profiles
  `discoverable: true`, supports generated `E2E_TEST_PASSWORD`, and avoids
  printing fixture passwords in CI.
- Event creation now exposes and persists optional end time, poll suggestion
  deadline, poll voting deadline, and reminder toggles. Migration
  `20260717120000_event_wizard_completion.sql` updates `create_event_atomic`
  and bumps `app_schema_version()` to `20260717120000`; `/api/health` now
  expects that version.
- The copyright page now lists a real DMCA/report contact address:
  `hello@tennysonmiles.com`.

Production read-only checks on July 17, 2026:

- `supabase migration list --linked` shows production in parity with the repo
  through `20260717081000`. The only pending migration is the new
  `20260717120000_event_wizard_completion.sql` from this branch.
- Supabase advisors currently report 34 security warnings and 106 performance
  warnings. Security is 33 authenticated SECURITY DEFINER warnings plus leaked
  password protection still disabled.
- Targeted database probes show no SECURITY DEFINER functions executable by
  `anon`, `normalize_phone_number` has `search_path=""`, `media-private` exists
  and is non-public, and storage object UPDATE policies include `WITH CHECK`.
- Targeted database probes also show nine public UPDATE policies still lacking
  explicit `WITH CHECK`: `capsule_entries.capsule_update`,
  `event_questions.event_questions_update`, `invite_answers.invite_answers_update`,
  `poll_votes.poll_votes_own_update`, `polls.polls_update`,
  `profiles.profiles_update`, `room_items.room_items_update`,
  `venues.venues_update`, and `zones.zones_update`.
- Five repo-seeded production fixture users still exist. They must be removed
  or rotated to operator-controlled generated credentials before pilot.

Checks blocked by missing operator/dashboard access in this session:

- Vercel CLI access to the linked project failed, so production and preview env
  isolation, `OBSERVABILITY_WEBHOOK_URL`, and provider/dashboard settings could
  not be verified from Vercel.
- The local `CRON_SECRET` did not authorize the full production `/api/health`
  matrix, so the gated `database/schema/storage/services/config` health payload
  still needs an operator bearer from the active production deployment.
- Docker was not running locally, so `supabase test db` and the new authed E2E
  job could not be exercised on this workstation.

Current recommendation remains **NO-GO for public launch** and **NO-GO for an
unmonitored pilot**. A tightly monitored owner-run pilot can proceed only after:
the new migration is applied via the normal migration workflow, the new
authenticated E2E job passes in GitHub and is required, production fixture
accounts are removed or rotated, leaked-password protection is enabled, the
remaining UPDATE policy checks are triaged or fixed, and the owner verifies
Vercel/health/alerting/preview settings plus legal copy sign-off.

### Production hardening update: 2026-07-17

With owner confirmation, production writes were performed on project
`cuzgighqdzypntmhxrqc`:

- Applied migration `20260717140000_explicit_update_policy_checks.sql`.
- Confirmed migration parity through `20260717140000`.
- Deleted the five repo-seeded production fixture users
  (`mara_host`, `leo_coffee`, `nina_music`, `omar_games`, `ivy_outdoors` at
  `users.switchboard.local`) and verified fixture count is now `0`.
- Verified `app_schema_version()` returns `20260717140000`.
- Verified public UPDATE policies without explicit `WITH CHECK` are now `[]`.

Leaked-password protection is still not complete. The Supabase CLI can read the
project, but the available keychain token is rejected by the Management API, and
this CLI version has no direct auth-config command or safe partial
`config.toml` push for `password_hibp_enabled`. Enable it in Supabase Dashboard
or rerun with a valid Management API token for
`PATCH /v1/projects/cuzgighqdzypntmhxrqc/config/auth` with
`{"password_hibp_enabled":true}`.

## What was audited

- Repository structure, documentation, Git state, and current GitHub Actions runs
- Next.js application routes, proxy behavior, Server Actions, and shared libraries
- Supabase migrations, RLS posture, function grants, storage policies, and live advisors
- Vercel project linkage, production/preview environment variable names, deployment state, and runtime logs
- Authentication, plan creation, invite delivery, public RSVP/join links, contacts, matching, media, voice notes, push, and legal surfaces
- Unit tests, lint, production build, Playwright public smoke tests, dependency audit, dead-code scan, complexity, and duplication
- Desktop and mobile public UI, accessibility, responsive behavior, and Lighthouse results

This was a read-only production audit. No database migrations were applied, provider credentials changed, production fixtures modified, or deployment triggered.

## Verification results

| Check | Result | Notes |
| --- | --- | --- |
| `npm run lint` | PASS | No lint errors |
| `npm test` | PASS | 23 files, 180 tests |
| `npm run build` | PASS | Next.js 16.2.10 production build |
| Public Playwright suite | PASS | 14 checks across desktop and mobile |
| Authenticated Playwright suite | SKIPPED | 6 checks require `E2E_DB=1`; CI does not provide it |
| GitHub CI | GREEN | Source CI and pgTAP workflow pass |
| Migration deploy workflow | FALSE GREEN | Exits successfully when required secrets are missing |
| Supabase migration parity | FAIL | Five repository migrations are absent from production |
| Production provider readiness | FAIL | Email, SMS, AI, and external observability variables are absent |
| Lighthouse, welcome | 95/93/100/91 | Performance/accessibility/best-practices/SEO |
| Lighthouse, login | 97/95/100/91 | Performance/accessibility/best-practices/SEO |

## Release blockers

### P0-1: Deployed code and production schema are out of sync

**Evidence**

`supabase migration list --linked` and `supabase db push --dry-run` report these committed migrations as pending in production:

- `20260711121000_identity_operator.sql`
- `20260711130000_cascade_editing.sql`
- `20260712120000_authz_hardening.sql`
- `20260712130000_private_media.sql`
- `20260713120000_event_timezone.sql`

The deployed app selects `events.time_zone`, calls RPCs introduced by the pending migrations, and expects the private media bucket introduced by them. Production logs already contain event lookup failures consistent with the missing `time_zone` column.

**Impact**

- Plan pages, RSVP, join links, notifications, home, and Open Graph rendering can fail.
- Cascade editing and identity operations can call functions that do not exist.
- Private media uploads can target a bucket or policy that does not exist.
- Authz fixes documented as high severity are not active in production.

**Required resolution**

Configure migration deployment, apply the five migrations in order, verify parity, rerun pgTAP and Supabase advisors, and add a post-deploy schema sentinel that checks the current required schema instead of only old profile columns.

### P0-2: Migration CI is designed to hide missing credentials

**Evidence**

`.github/workflows/deploy-migrations.yml:40-43` prints a skip message and exits `0` when Supabase deploy secrets are absent. GitHub run `29268939967` was marked successful with all three values empty and no migration push.

**Impact**

Every merge can produce a green deployment while leaving the database behind. This is the direct mechanism behind P0-1.

**Required resolution**

Make the job fail closed on `main`, add a separate explicit preflight for required secret names, configure repository secrets, and require the migration check before release promotion.

### P0-3: Signed-out recipients cannot open public invite links

**Evidence**

- `src/app/join/[id]/page.tsx:36-43` explicitly defines a public shareable join page.
- `src/app/join/[id]/page.tsx:193-202` includes a signed-out call to action.
- `src/proxy.ts:5-21` omits `/join` from public prefixes.
- Both local and production requests to `/join/<uuid>` return a `307` redirect to `/welcome`.

**Impact**

The main invitation link cannot be used by the people who most need it: recipients without an existing browser session.

**Required resolution**

Make `/join` public, preserve the intended destination through sign-in/account creation, and add browser coverage for signed-out, signed-in, inactive, and non-shareable link states.

### P0-4: Invitation delivery is not production-ready

**Evidence**

Production has no `RESEND_API_KEY`, `EMAIL_FROM`, `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, or `PLIVO_FROM_NUMBER`. The provider wrappers return `false` after logging that delivery was skipped, while plan creation remains successful and does not expose per-recipient delivery outcomes.

**Impact**

Users can reasonably believe invitations were sent when no email or text left the server. This breaks the central product promise and makes failed delivery hard to diagnose.

**Required resolution**

Configure and verify providers, record delivery attempts and provider message IDs, distinguish `queued`, `sent`, `delivered`, and `failed`, process provider webhooks idempotently, and show honest recipient-level status plus retry controls.

### P0-5: Core authenticated journeys are not part of the release gate

**Evidence**

`e2e/authed.spec.ts:9-23` skips the entire suite unless `E2E_DB` is set. The skipped cases include sign-in, opening the plan wizard, and creating a plan with a guest. The public bad-credentials test uses `invalid!`, which is rejected by validation before exercising a valid-shaped Supabase login failure.

**Impact**

The most costly regressions can merge with green CI: account creation, real bad-password feedback, plan publication, invites, RSVP, and media.

**Required resolution**

Run a disposable or dedicated test Supabase environment in CI, seed deterministic fixtures, test real authenticated paths, and make the suite required for release.

## High-priority findings

### P1-1: Unverified contact details are trusted as identity

`src/lib/actions/auth.ts:176-180` creates users with `email_confirm: true`. `src/lib/actions/profile.ts:108-137` lets users set arbitrary contact email and phone values. Contact resolution can use those values to match friends and invitations.

**Risk:** A user can claim an email address or phone number they do not own and may intercept identity-based matching or invitations intended for someone else.

**Recommendation:** Introduce verified contact records and OTP verification. Only verified identifiers may drive account matching, in-app invite routing, or discoverability. Existing profile values should be migrated as unverified. Username-only accounts may continue to use the synthetic internal auth email.

### P1-2: Voice recording is disabled by the application's own headers

`next.config.ts:13-16` sends `microphone=()` for every route. `src/components/ui/VoiceRecorder.tsx:96-107` calls `getUserMedia({ audio: true })`.

**Risk:** Standards-compliant browsers deny microphone access before the user can grant it.

**Recommendation:** Permit same-origin microphone use on the required surface, retain camera and geolocation restrictions, and test permission granted, denied, and unavailable states.

### P1-3: Live database security advisories require remediation

The linked production project reports 48 security warnings and 100 performance warnings. Material security items include:

- Leaked-password protection disabled
- `normalize_phone_number` has a mutable `search_path`
- A public media bucket allows broad listing
- Twenty SECURITY DEFINER functions are executable by `anon`
- Multiple update policies do not state an explicit `WITH CHECK`
- Four tables have multiple permissive policies for the same operation/role

All public tables currently have RLS, which is a strong baseline. The missing authz migration addresses some known issues, but grants and advisors must be reevaluated after it is applied.

### P1-4: Observability loses error detail and has no configured sink

`src/lib/server/observability.ts:6` converts non-`Error` objects with `String(error)`. Supabase errors therefore become `[object Object]`; this is visible in production logs. `OBSERVABILITY_WEBHOOK_URL` is absent.

**Recommendation:** Serialize structured provider/Supabase fields safely, redact secrets and personal data, attach request/build/schema identifiers, configure an alerting sink, and alert on invitation, auth, upload, and migration failures.

### P1-5: Preview deployments are not representative

Preview has service-role and VAPID variables but lacks the public Supabase URL and anon key. It cannot exercise the normal app safely or faithfully.

**Recommendation:** Link preview to an isolated Supabase branch/project with a complete non-production configuration. Never use production service credentials in a partially configured preview.

### P1-6: Google sign-in can fail without actionable feedback

The Google button is always displayed, and its OAuth call does not surface the returned provider error. A disabled or incomplete Supabase Google provider can reproduce the same apparent no-op behavior previously seen in password sign-in.

**Recommendation:** Confirm provider readiness before displaying the action or handle and display every OAuth error, including popup/redirect failures.

### P1-7: Production seed-account state must be verified

`scripts/seed-test-profiles.mjs:5` has a repository-visible fallback password and can target whichever Supabase environment is supplied. The connected Supabase tool did not grant row-query permission, so this audit could not verify whether those five accounts exist in production.

**Recommendation:** Query production through an authorized operator, delete production fixtures or rotate them to generated secrets, require an explicit non-production environment guard, remove the fallback password, and make seeds idempotent only in test projects.

## Feature completeness

| Feature | Source status | Production confidence | Ship assessment |
| --- | --- | --- | --- |
| Username/email + password auth | Implemented | Partial | Needs real bad-credential E2E and verified email design |
| Account creation/onboarding | Implemented | Partial | Admin-created and auto-confirmed email; not release-tested |
| Password reset | Implemented | Public page tested | Provider/email delivery still needs live verification |
| Google OAuth | UI implemented | Unknown | Configuration/error handling incomplete |
| Plan creation wizard | Implemented | Low | Authenticated E2E skipped; schema drift can break publish |
| Plan editing/cohosts | Implemented | Low | Authz/cascade migration absent from production |
| Email invitations | Code path implemented | Not operational | Provider variables absent |
| SMS invitations | Code path implemented | Not operational | Provider variables absent |
| In-app invitations | Implemented | Partial | Identity matching must require verified contacts |
| Public guest RSVP | Implemented | Partial | Unknown-token state tested; live delivery journey not tested |
| Shareable public join | Implemented behind wrong proxy rule | Broken | Signed-out recipients redirected |
| Friends by handle/email/phone | Implemented | Unsafe edge | Contact ownership not verified |
| Contact import/matching | Implemented | Partial | Browser permissions/privacy and verified matching need E2E |
| Discovery/matching | Implemented | Partial | Safety, abuse, and consent tests need expansion |
| Image upload | Implemented | Low | Private-media migration absent; authenticated upload E2E skipped |
| Audio/voice notes | Implemented | Broken by header | Microphone disabled globally |
| Push notifications | Implemented | Configured by env names | Requires device-level acceptance test |
| Cascade editing | Implemented | Not deployed | Migration absent |
| Time-zone rendering | Implemented | Not deployed | Migration absent and production errors observed |
| Legal/community/copyright | Implemented and linked | Public routes tested | Counsel review remains a human release step |
| AI extraction | Implemented with fallback | Provider absent | Decide whether optional or release-required and report status honestly |

"Implemented" in this table means a coherent source path exists. It does not mean the feature has passed production acceptance testing.

## Code quality and developer experience

### Strengths

- Strict TypeScript/ESLint/build checks pass.
- Unit suite is fast and healthy: 180 passing tests.
- Database changes are migration-based and pgTAP coverage exists.
- RLS is enabled on every public table.
- Server-side auth helpers and validation patterns are generally consistent.
- Duplication is low: `jscpd` found 0.52% duplicated lines.
- Security headers, CSP nonces, rate limiting, private-media work, legal pages, and reduced-motion handling show good production instincts.
- Product intent is documented in `PRODUCT.md`, and `docs/SECURITY.md` is a useful baseline.

### Maintainability risks

Several files combine data access, state orchestration, formatting, and large view trees:

- `EventWizard`: about 1,448 lines; measured complexity 63
- `EventPage`: about 751 lines; measured complexity 128
- `PeopleClient`: about 975 lines; measured complexity 28
- `src/lib/actions/events.ts`: about 838 lines; individual actions up to complexity 37
- `loadMyIdentity`: measured complexity 77
- Profile page: measured complexity 60

These are not proof of bugs, but they increase review cost and make behavior-preserving changes harder. Refactor only after the P0 release behavior is protected by end-to-end tests.

### Dead and stale surface

`knip` identified:

- Genuine dead component: `src/app/settings/SaveButton.tsx`
- Likely false positives: `public/sw.js` and `e2e/seed.mjs`, which are invoked by path/configuration
- Thirteen unused exports and thirty-six unused exported types requiring manual confirmation
- Unreferenced default Next assets: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, and `public/window.svg`

Do not bulk-delete from tool output alone. Prove each candidate with repository search, route/config inspection, and tests.

The README and `docs/AUDIT-AND-HANDOFF.md` are behind the present feature set and test counts. `docs/DOCKET.md` mixes ideas, queued work, and shipped work, so it is not a reliable release checklist for a new developer.

## UI and accessibility audit

**Anti-pattern verdict:** The authenticated product has a coherent, friendly visual system, but the welcome surface reads as template-like because it combines gradient headline text, emoji-led feature claims, repeated rounded cards, and a narrow mobile composition stretched onto desktop.

### Scorecard

| Area | Score | Reason |
| --- | ---: | --- |
| Accessibility | 2/4 | Contrast failures, missing welcome `<main>`, undersized touch targets, incomplete sheet dialog behavior |
| Performance | 3/4 | Lighthouse 95-97, low blocking time/CLS; large client components remain a cost |
| Responsive | 3/4 | No 320px overflow and sound mobile layout; desktop underuses space and some controls are too small |
| Theming | 3/4 | Central tokens and consistent focus/reduced motion; stale manifest colors and hard-coded decorative treatments |
| Anti-patterns | 2/4 | Repetitive cards, gradient text, emoji feature decoration, uniformly oversized rounding |
| **Total** | **13/20** | Acceptable foundation; significant polish and accessibility work remains |

### P1 UI findings

1. **More sheet lacks complete dialog behavior.** It uses `role="dialog"` but has no focus trap, Escape behavior, focus restoration, or explicit close control. Keyboard and assistive-technology users can lose context. Use an established dialog/sheet primitive and verify focus flow.
2. **Public text contrast fails automated checks.** Welcome footer text/links, login separator text, and the forgot-password link are below target contrast. Use stronger semantic tokens and re-run axe/Lighthouse.
3. **Touch targets are undersized.** Welcome sign-in/footer links and the login mode tabs are below the 44px guideline. Increase hit areas without inflating visual type.
4. **Welcome lacks a main landmark.** Wrap primary content in `<main>` and preserve heading order.

### P2 UI findings

1. Replace gradient headline text and the repeated emoji feature-card stack with a more product-specific demonstration of planning, invitations, and response states. Suggested Impeccable command: `/distill` followed by `/polish`.
2. Let desktop show more of the actual planning experience while retaining the strong mobile-first density. Suggested command: `/adapt`.
3. Align `manifest.webmanifest` theme/background colors with current design tokens.
4. Add a valid `robots.txt`; the current request resolves to application HTML/404 behavior.
5. Replace the Open Graph emoji glyph that generates dynamic-font 400 errors with a bundled asset or supported local font.

## Dependencies and platform hygiene

- `npm audit --omit=dev` reports two moderate PostCSS advisories within Next's bundled dependency graph. The suggested forced fix downgrades Next and must not be used. Track and install an official patched Next release when available.
- The local Supabase CLI is 2.98.2 while 2.109.1 is available. Pin or document the expected CLI version so local and CI behavior match.
- Several minor package updates are available. Update in small batches with the full verification gate; do not combine them with release-blocker fixes.

## Recommended architecture direction

Keep the current Next.js + Supabase structure. A rewrite is not warranted.

After critical flows have end-to-end protection:

1. Split `EventWizard` into step components backed by one typed reducer/state machine and a single submission boundary.
2. Move `EventPage` data assembly into a typed server-side view model, then split independent sections by responsibility.
3. Split `PeopleClient` into Friends, Contacts, Discovery, and Matches feature modules with shared identity display primitives.
4. Divide `events.ts` Server Actions by capability: lifecycle, participants/invites, scheduling, and venue/polling.
5. Add focused unit/integration tests around every Server Action that mutates authorization-sensitive data.
6. Generate Supabase TypeScript types in CI after migration validation and fail on drift.

## Release gate

A candidate is ready for a controlled user pilot only when all of these are true:

- [x] Production and repository migration histories match exactly.
- [x] Migration workflow fails when it cannot deploy and has a required green run.
- [ ] Supabase security advisors have no unresolved release-critical warnings.
      Leaked-password protection remains disabled; authenticated
      SECURITY DEFINER advisor warnings remain to be reviewed/accepted or
      narrowed.
- [ ] Signed-out invite link, account creation/sign-in, join request, host approval, and RSVP pass end to end.
- [ ] Plan creation with username, email, phone, and connected-friend recipients passes end to end.
- [ ] Email and SMS delivery status is truthful and provider webhooks are verified.
- [ ] Contact-based matching uses only verified identifiers.
- [ ] Image upload and voice-note upload/playback pass on mobile Safari and Chrome.
- [ ] Bad password, disabled OAuth, provider outage, and upload failure all give actionable UI feedback.
- [ ] Authenticated Playwright tests run in CI and are required. Source wiring is
      in place on this branch; GitHub run and required-check protection still
      need confirmation after PR.
- [ ] Preview uses an isolated, complete backend configuration.
- [ ] Health checks verify required schema, storage, and release-critical providers.
- [ ] Alerts are configured and a rollback procedure has been rehearsed.
- [x] Production fixture accounts are absent or use operator-controlled generated credentials.
- [ ] Privacy, Terms, Community Commitment, and Copyright copy receive final owner/counsel approval.
- [ ] Accessibility findings above are resolved and axe/Lighthouse are rerun.
- [ ] A small invited pilot completes a monitored create-invite-respond cycle before broader release.

## Product recommendation

Ship the smallest trustworthy loop first: **create a plan, invite known people, receive honest responses, and coordinate safely**. Discovery, anonymous mutual matching, geographic serendipity, and richer AI assistance can be strong differentiators, but they widen safety and moderation obligations. Keep those behind explicit feature flags until identity verification, reporting/blocking, consent boundaries, observability, and the core invitation loop are proven under real pilot use.

The ordered implementation plan is in `docs/CHATGPT-5-5-PROMPT-MAP.md`.
