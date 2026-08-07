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
  they control). `/forgot-password` says so, but nothing ever prompts these
  users to add a recovery email. See "Open decisions" below.

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
7. **CI could not verify that sign-in works.** Both suites ran Playwright
   against `next dev`, compiling routes on demand, so the 5s assertion default
   was timing the compiler; `GET /welcome` takes 4.8s cold. Every authenticated
   journey failed at once, main had been red for a week, and no login regression
   would have been caught. The authenticated job now runs a production build.

### Open decisions — not changed here

These need a product or security call rather than a unilateral fix.

8. **The per-account sign-in limit is a remotely triggerable lockout.**
   `checkRateLimit('signin:<identifier>', 8, 10min)` is keyed only on the
   identifier and is consumed *before* credentials are checked. Anyone who knows
   a user's email can burn all 8 every 10 minutes and keep them out
   indefinitely. It also means a person fumbling their own password 8 times is
   locked out — plausible for exactly the users this incident involved.
   *Recommendation:* add a per-IP bucket as the primary brute-force defence and
   loosen the per-account one. Raising the per-account limit alone trades one
   risk for the other; the two buckets are what resolve it.
9. **Username sign-in silently breaks without service-role credentials.**
   `resolveIdentifierEmails` resolves a handle to its real login email via the
   admin client. Without it, it falls back to the synthetic
   `<handle>@users.switchboard.local`, which is wrong for anyone who signed up
   with an email — so their username stops working. Production has the
   credentials; a misconfigured deployment fails silently.
10. **Username-only accounts have no recovery path** (see §2 above). Consider
    prompting for a recovery email during onboarding.
11. **`/auth/confirm` drops `next` when a link fails**, so an expired link taken
    from a deep link loses the destination. Cosmetic next to the rest.

## Guards (keep them green)

- `src/lib/actions/auth.test.ts` — the blocked-account table. Every Supabase
  refusal that can follow a *correct* password must map to its own code; a new
  one left to fall through lands back in "did not work", and the table is what
  fails first.
- `src/lib/errors.test.ts` — every reader-facing failure carries a code, and
  every reader-actionable code carries a real next step.
- `e2e/authed.spec.ts` — the real journey: sign in, land inside the app. This is
  the test that must never be allowed to sit red again.

## When you touch this

Ask the question that all five bugs failed to ask: **for the account state I am
changing, what does the person see, and what can they press?** If the answer is
"the generic sentence" or "nothing", the change is not finished.
