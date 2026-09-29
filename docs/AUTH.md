# Getting into an account

Switchboard has shipped the same class of bug five separate times:

| PR | What was broken |
| --- | --- |
| #82 | Shared links dead-ended; signup didn't establish a session |
| #93 | Password recovery never sent the email |
| #100 | Recovery and Google OAuth failed with no diagnosis |
| #102 | A signed-in user was trapped in a redirect loop |
| #121 | A confirmed-correct password was reported as wrong |

Every one of them was a person holding valid credentials who could not get in,
and every one was found by a user rather than by us. That is the pattern this
document exists to end.

## The invariant

**No state an account can be in is a dead end.** For every combination of
(identifier kind × confirmation state × profile state × moderation state), the
person either gets in, or is told what is true and what to do next. "That email,
username, or password did not work." is only ever correct when the credentials
really were wrong.

Two corollaries, both of which have been violated in production:

- **A message must name its own cause.** One sentence covering four causes makes
  a screenshot worthless — the same lesson as `src/lib/errors.ts` and the invite
  link saga, applied to the front door.
- **Every blocked state needs a route out that the reader can reach from where
  they are standing.** A link they never received is not a route out.

## Every way in, and what stops it

### 1. Email sign-up

`createPasswordAccount` → `admin.generateLink({ type: 'signup' })` → the account
exists **unconfirmed** → confirmation mail via Resend → `/auth/confirm` verifies
and marks the contact verified.

The account cannot sign in until that link is opened. Supabase refuses the
password grant with `email_not_confirmed`; GoTrue checks the password *first*,
so that code always means the credentials were right.

- *Was broken:* the refusal rendered as "password did not work", and no second
  confirmation link could ever be sent. An address whose provider spam-foldered
  the first mail (AOL, Yahoo) was permanently locked out. **Fixed** —
  `SB-AUTH-UNCONFIRMED` plus `resendEmailConfirmation`.

### 2. Username sign-up

Same action, but the login email is synthetic
(`<handle>@users.switchboard.local`), `email_confirm: true` is set at creation,
and the account is signed in immediately. No confirmation step, so none of the
above applies.

- *Residual risk:* a username-only account with no verified email contact
  **cannot recover a forgotten password at all** — by design
  (`docs/SECURITY.md` §9: never mail a recovery link to an address nobody proved
  they control). `/forgot-password` says so. Onboarding now offers these
  accounts an optional recovery-email step, and Settings keeps a banner up
  until one is verified (finding 14 below).

### 3. Google OAuth

`signInWithOAuth` → `/auth/callback` → `exchangeCodeForSession`. The profile row
is created by the `handle_new_user` trigger, not by application code.

- *Residual risk:* if that trigger is ever missing from a project, the account
  authenticates with no profile row. See finding 3 below for why that used to be
  unrecoverable.

### 4. Password recovery

`requestPasswordReset` → `admin.generateLink({ type: 'recovery' })` → Resend →
`/auth/confirm?type=recovery` → `/reset-password`.

Verifying a recovery OTP also **confirms an unconfirmed address**, which is why
"Forgot password?" is the manual workaround for finding 1.

### 5. Session refresh and routing

`src/proxy.ts` refreshes the session and decides public vs. protected;
`src/lib/auth-bounce.ts` breaks the loop that occurs when the proxy and a page
disagree about whether a session exists. Onboarding and legal-version funnels
also live in the proxy.

## Findings

### Fixed in this pass

1. **Unconfirmed email reported as a wrong password.** The original report.
   `SB-AUTH-UNCONFIRMED` now names it, with the address and a next step.
2. **No way to re-send a confirmation link.** `resendEmailConfirmation` mints a
   magic link (which both proves control of the address and confirms it), scoped
   to an account that already claims the address, answering generically either
   way.
3. **Onboarding could trap an account forever.** `completeOnboarding` used
   `update`, so an account with no profile row matched zero rows, `.single()`
   errored, and it redirected to `/onboarding?error=save`. Onboarding is the only
   route out of onboarding — that is not a failed save, it is a permanent
   lockout. `createPasswordAccount` already used `upsert` for exactly this
   reason and carried a comment explaining it; the sibling never got the fix.
   Now upserts.
4. **A suspended account and a rate-limited one both read as "wrong
   password".** Now `SB-AUTH-SUSPENDED` and `SB-RATE-LIMIT`.
5. **Our own rate limit didn't say how long to wait** and carried no code, so it
   was indistinguishable from a wrong password on the fourth try.
6. **A rejected sign-in logged nothing at all**, which is why the original report
   could not be diagnosed from the logs. The reason code is now logged (never the
   identifier).
7. **CI could not verify that sign-in works.** Two independent causes, and the
   first one masked the second:
   - Both suites ran Playwright against `next dev`, compiling routes on demand,
     so the 5s assertion default was timing the compiler (`GET /welcome` takes
     4.8s cold). The authenticated job now runs a production build.
   - **The E2E seed never accepted the current legal version.** `e2e/seed.mjs`
     set `onboarded: true` but left `legal_terms_version` null, and `src/proxy.ts`
     funnels any onboarded user whose accepted version isn't current to
     `/legal-update` — which renders without the app shell. So every
     authenticated journey landed on a page with no navigation and failed on a
     missing element. Eight tests, one cause, none of them looking like it.
     The seed now derives `LEGAL_VERSION` from `src/lib/legal.ts` rather than
     copying it, so the next bump cannot silently do this again.

   Main had been red since July 31 — the bump that introduced this — so no login
   regression would have been caught in that window. Including this one.
8. **Accepting updated terms could loop forever.** `acceptLatestTerms` used
   `update` and never checked the write landed. The proxy sends every protected
   route to `/legal-update` until that column matches, so an update matching zero
   rows (no profile row) or filtered by RLS bounced the reader between the two
   pages indefinitely while the form reported success each time. Now upserts and
   reads the version back — the same fix as finding 3, for the same reason.
9. **The per-account sign-in limit was a remotely triggerable lockout.** The
   hard boundary is now a forwarded-client-IP bucket (30 sign-ins per 10
   minutes; sign-up is 12 per hour). Identifier buckets remain only as soft
   abuse signals: after 20 sign-ins per 10 minutes or 10 sign-ups per hour they
   add 750 ms of backoff but never reject the request. Auth limiter failures
   fail closed and report `SB-RATE-LIMIT`, so losing limiter state cannot open an
   unlimited credential path.
10. **Editable profile email could select another account for recovery.** Reset
    and confirmation resend now look up a real login address only in
    `auth.users.email`. Username accounts may fall back to a verified email in
    `profile_contacts`; `profiles.contact_email` is never a recovery authority.
    Regression tests prove that changing that profile field cannot redirect
    either flow.
11. **Signing up again with an unconfirmed email kept the first password.** The
    natural move after a lost confirmation mail is to create the account
    again. GoTrue answers a second signup link for an unconfirmed address by
    keeping the first password (it cannot know the second request is the same
    person), and `uniqueHandle` saw the account's own handle as taken and
    renamed it `alex2`. The reader confirmed, then the password they had just
    chosen reported "did not work". `createPasswordAccount` now checks
    `auth_user_id_by_email` first: an unconfirmed account gets a fresh sign-in
    link through `resendEmailConfirmation` and a sentence saying which password
    is live; a confirmed one is refused before any link is minted.
12. **Onboarding stuck on "Saving…" after any refused save.** Errors come back
    as `/onboarding?error=…`, which keeps the form mounted, and its submitting
    flag was never reset. The button now reads the form's own pending state,
    and an error about a step-one field returns the reader to step one.

### Decided in the 2026-09 completion pass

These were open decisions; the owner accepted the recommendations in
`docs/COMPLETION-PLAN-2026-09.md` (G45, D27).

13. **Username sign-in without service-role credentials now says so.**
    `resolveIdentifierEmails` resolves a handle to its real login email via the
    admin client. It used to fall back to the synthetic
    `<handle>@users.switchboard.local`, which is wrong for anyone who signed up
    with an email, so their username "did not work" with the right password.
    Without the credentials it now refuses before any password grant with
    `SB-CONFIG-AUTH` and a sentence pointing at the one route that still works:
    the account's email address. Email sign-in is unaffected. Guarded in
    `src/lib/actions/auth.test.ts`.
14. **Username-only accounts are asked for a recovery email.** Onboarding shows
    username sign-ups an optional third step; the address becomes the profile's
    contact email (unverified) and a verification link is sent on the way out.
    Nothing blocks on it — onboarding is the only route out of onboarding.
    Settings shows a banner to any account whose login address is synthetic and
    which has no verified email, saying plainly that a forgotten password cannot
    be reset until one is verified, with the step that fixes it. Recovery still
    only ever mails a *verified* contact (`docs/SECURITY.md` §9).
15. **`/auth/confirm` keeps `next` when a link fails.** A failed confirmation or
    magic link now sends the reader to `/login` with the destination attached,
    so signing in afterwards lands where the link was going (the invitation,
    the onboarding funnel). A failed recovery link says it was a reset link and
    offers a fresh one rather than "sign in", which is no route out for someone
    who forgot the password. Both show `SB-AUTH-LINK`, whose sentence includes
    "already used": mail scanners open links before people do, so the reader may
    be confirmed already.

Google sign-in failures on `/login` now carry codes too — `SB-OAUTH-DENIED`,
`SB-OAUTH-EXCHANGE`, `SB-OAUTH-MISSING`, and `SB-OAUTH-START` when the auth
server will not start the round trip — and `/auth/callback` logs the same code
it redirects with.

## Guards (keep them green)

- `src/lib/actions/auth.test.ts` — the blocked-account table. Every Supabase
  refusal that can follow a *correct* password must map to its own code; a new
  one left to fall through lands back in "did not work", and the table is what
  fails first.
- `src/lib/errors.test.ts` — every reader-facing failure carries a code, and
  every reader-actionable code carries a real next step.
- `e2e/authed.spec.ts` — the real journey: sign in, land inside the app. This is
  the test that must never be allowed to sit red again. Its fixtures
  (`e2e/seed.mjs`) derive `LEGAL_VERSION` from source, because a fixture that
  drifts out of the proxy's funnels fails as eight unrelated-looking UI errors
  rather than as "the fixture is stale".

## When you touch this

Ask the question that all five bugs failed to ask: **for the account state I am
changing, what does the person see, and what can they press?** If the answer is
"the generic sentence" or "nothing", the change is not finished.
