'use server';

import type { ErrorCode } from '@/lib/errors';

import { failure, validation } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';

import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import {
  appUrl,
  emailEnabled,
  looksLikeEmail,
  sendEmailWithResult,
} from '@/lib/server/email';
import {
  PASSWORD_MIN_LENGTH,
  USERNAME_EMAIL_DOMAIN,
  emailToHandleCandidate,
  isEmailIdentifier,
  isValidUsername,
  normalizeIdentifier,
  normalizeUsername,
  usernameToAuthEmail,
} from '@/lib/auth-identity';
import { LEGAL_VERSION } from '@/lib/legal';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeNextPath } from '@/lib/security';
import { guardAuthAttempt } from '@/lib/server/auth-rate-limit';

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  username?: string;
  identifier?: string;
  requiresEmailVerification?: boolean;
  /**
   * The account exists and the password was right, but its email was never
   * confirmed. The sign-in card uses this to offer a resend instead of telling
   * the reader to re-check credentials that already work.
   */
  needsEmailConfirmation?: boolean;
  /** True when account creation also established a session (username signups). */
  signedIn?: boolean;
  /** Where the client should navigate once auto-signed-in. */
  redirectTo?: string;
}

/** How long the per-account sign-in bucket takes to refill, in minutes. */
const SIGNIN_WINDOW_MINUTES = 10;

/**
 * Why Supabase refused a sign-in whose password may well have been right.
 *
 * GoTrue verifies the password *before* it checks any of these, so each one
 * describes an account the reader legitimately owns and cannot get into. They
 * used to share a sentence with a mistyped password, which is the shape that
 * makes a report unanswerable: four causes, one screenshot, no diagnosis.
 */
const BLOCKED_ACCOUNT_CODES: Record<string, ErrorCode> = {
  email_not_confirmed: 'SB-AUTH-UNCONFIRMED',
  user_banned: 'SB-AUTH-SUSPENDED',
  // Supabase's own limiter, distinct from ours above.
  over_request_rate_limit: 'SB-RATE-LIMIT',
};

async function uniqueHandle(baseHandle: string): Promise<string | null> {
  const admin = createAdminClient();
  const base = normalizeUsername(baseHandle).slice(0, 24);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? '' : String(attempt + 1);
    const candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
    if (!isValidUsername(candidate)) continue;

    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return null;
}

async function resolveIdentifierEmails(identifier: string): Promise<string[]> {
  const normalized = normalizeIdentifier(identifier);
  if (isEmailIdentifier(normalized)) {
    const emails = [normalized];
    if (hasAdminCredentials()) {
      const admin = createAdminClient();
      const { data: contact } = await admin
        .from('profile_contacts')
        .select('user_id')
        .eq('kind', 'email')
        .eq('normalized_value', normalized)
        .not('verified_at', 'is', null)
        .limit(1)
        .maybeSingle();

      if (contact?.user_id) {
        const { data } = await admin.auth.admin.getUserById(contact.user_id);
        if (data.user?.email && !emails.includes(data.user.email)) {
          emails.push(data.user.email);
        }
      }
    }
    return emails;
  }
  if (!isValidUsername(normalized)) throw new Error('invalid_identifier');

  if (hasAdminCredentials()) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', normalized)
      .maybeSingle();

    if (profile?.id) {
      const { data } = await admin.auth.admin.getUserById(profile.id);
      if (data.user?.email) return [data.user.email];
    }
  }

  return [usernameToAuthEmail(normalized)];
}

export async function signInWithPasswordIdentifier({
  identifier,
  password,
}: {
  identifier: string;
  password: string;
}): Promise<AuthActionResult> {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized || password.length === 0) {
    return validation('Enter your email or username and password.');
  }
  if (!isEmailIdentifier(normalized) && !isValidUsername(normalized)) {
    return validation('That email, username, or password did not work.');
  }

  try {
    const throttle = await guardAuthAttempt('signin', normalized);
    if (!throttle.allowed) {
      // Carries the code so a screenshot of this is distinguishable from a
      // wrong password — they read almost identically to someone who is simply
      // being told "no" for the fourth time.
      return failure(
        'SB-RATE-LIMIT',
        `Too many sign-in attempts from this connection. Wait ${SIGNIN_WINDOW_MINUTES} minutes and try again.`,
      );
    }

    const emails = await resolveIdentifierEmails(normalized);
    const supabase = await createClient();
    let blocked: { code: ErrorCode; email: string } | null = null;
    let lastReason = 'unknown';
    for (const email of emails) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!error) return { ok: true };
      lastReason = error.code ?? `status_${error.status ?? 'none'}`;
      // GoTrue verifies the password *before* it checks any of these, so they
      // only ever come back when the credentials were correct. That is what
      // makes it safe to say so out loud: none of it reveals anything to
      // someone who doesn't already hold the password (docs/SECURITY.md §9).
      const code = error.code ? BLOCKED_ACCOUNT_CODES[error.code] : undefined;
      if (code && !blocked) blocked = { code, email };
    }

    if (blocked) {
      return {
        ...failure(blocked.code),
        identifier: blocked.email,
        // Only the unconfirmed case has a link we can re-send; a suspension or
        // a rate limit has nothing for the reader to press.
        needsEmailConfirmation: blocked.code === 'SB-AUTH-UNCONFIRMED',
      };
    }

    // A rejected sign-in left no trace at all before this, so "she typed the
    // right password and it didn't work" was unanswerable from the logs. The
    // reason code is enough to tell a wrong password from an unconfirmed or
    // banned account; the identifier stays out of it.
    console.info(
      JSON.stringify({ level: 'info', area: 'auth.signin', outcome: 'rejected', reason: lastReason }),
    );
    return validation('That email, username, or password did not work.');
  } catch (error) {
    console.error('[auth:signin:error]', error);
    return failure(
      'SB-AUTH-SIGNIN',
      'Sign-in is temporarily unavailable. Please try again in a moment.',
    );
  }
}

export async function createPasswordAccount(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const displayName = String(formData.get('display_name') ?? '').trim();
  const identifier = normalizeIdentifier(String(formData.get('identifier') ?? ''));
  const password = String(formData.get('password') ?? '');
  const nextPath = safeNextPath(String(formData.get('next') ?? ''), '/');
  const afterOnboarding = `/onboarding?next=${encodeURIComponent(nextPath)}`;
  const acceptedTerms = formData.get('terms_agreement') === 'on';
  const acceptedCovenant = formData.get('community_agreement') === 'on';

  if (!displayName) return validation('Add your name.');
  if (!isEmailIdentifier(identifier) && !isValidUsername(identifier)) {
    return validation('Use a valid email or a username with 3-24 letters, numbers, or underscores.');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return validation(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (!acceptedTerms || !acceptedCovenant) {
    return validation('Please acknowledge the Terms, Privacy Notice, and Community Covenant.');
  }

  if (!hasAdminCredentials()) {
    return failure('SB-CONFIG-AUTH', 'Account creation is not configured on this server yet.');
  }

  try {
    const throttle = await guardAuthAttempt('signup', identifier);
    if (!throttle.allowed) {
      return failure('SB-RATE-LIMIT', 'Too many account attempts. Wait a while and try again.');
    }

    const admin = createAdminClient();
    const usesRealEmail = isEmailIdentifier(identifier);
    if (usesRealEmail && !emailEnabled()) {
      return failure(
        'SB-CONFIG-EMAIL',
        'Email account creation is not configured on this server yet.',
      );
    }
    const email = usesRealEmail
      ? identifier
      : usernameToAuthEmail(identifier);
    const username = usesRealEmail
      ? await uniqueHandle(emailToHandleCandidate(identifier))
      : normalizeUsername(identifier);

    if (!username) {
      return failure('SB-AUTH-SIGNUP', 'Could not create a unique username for that email.');
    }

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', username)
      .maybeSingle();

    if (existingProfile) return validation('That username is already taken.');

    const userMetadata = {
      full_name: displayName.slice(0, 80),
      username,
    };
    let userId: string | null = null;
    let confirmationUrl: string | null = null;
    let createError: { message: string } | null = null;

    if (usesRealEmail) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: {
          data: userMetadata,
          redirectTo: appUrl(`/auth/confirm?next=${encodeURIComponent(afterOnboarding)}`),
        },
      });
      createError = error;
      userId = data.user?.id ?? null;
      const hashedToken = data.properties?.hashed_token;
      confirmationUrl = hashedToken
        ? appUrl(
            `/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=signup&next=${encodeURIComponent(afterOnboarding)}`,
          )
        : data.properties?.action_link ?? null;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      createError = error;
      userId = data.user?.id ?? null;
    }

    if (createError) {
      if (/already|registered|exists/i.test(createError.message)) {
        return validation('That email or username is already taken.');
      }
      return failure('SB-AUTH-SIGNUP', createError.message);
    }

    if (!userId) return failure('SB-AUTH-SIGNUP', 'Could not create that account.');

    // Essential profile fields. Upsert (not update) so signup still succeeds
    // when the `handle_new_user` trigger has not been applied to the project
    // and no row was auto-created — otherwise the update would silently affect
    // zero rows and leave a handle-less account behind.
    const { error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          id: userId,
          display_name: displayName.slice(0, 80),
          handle: username,
          legal_terms_version: LEGAL_VERSION,
          legal_terms_accepted_at: new Date().toISOString(),
          community_covenant_accepted_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      if (profileError.code === '23505') {
        return validation('That username is already taken.');
      }
      return failure('SB-AUTH-SIGNUP', 'Could not finish creating your profile.');
    }

    // The profile trigger mirrors this into profile_contacts as unverified;
    // /auth/confirm records proof of ownership after the signup link succeeds.
    if (usesRealEmail) {
      const { error: contactError } = await admin
        .from('profiles')
        .update({ contact_email: email })
        .eq('id', userId);
      if (contactError) {
        await admin.auth.admin.deleteUser(userId);
        return failure(
          'SB-AUTH-SIGNUP',
          'Could not attach that email to the new account. No account was created.',
        );
      }
    }

    if (usesRealEmail) {
      if (!confirmationUrl) {
        await admin.auth.admin.deleteUser(userId);
        return failure(
          'SB-AUTH-SIGNUP',
          'Could not create a verification link for that email.',
        );
      }
      const delivery = await sendEmailWithResult({
        to: email,
        subject: 'Confirm your Switchboard account',
        text:
          `Confirm your Switchboard email and finish signing in:\n\n${confirmationUrl}\n\n` +
          `If you did not create this account, ignore this message.`,
      });
      if (delivery.status !== 'sent') {
        await admin.auth.admin.deleteUser(userId);
        return failure(
          'SB-AUTH-SIGNUP',
          'The confirmation email could not be sent. No account was created.',
        );
      }
    }

    // The account now definitively exists (every failure path above deletes
    // it), so this is the single funnel point for both identifier flows.
    await capture(userId, ANALYTICS_EVENTS.signupCompleted, {
      method: usesRealEmail ? 'email' : 'username',
    });

    // Username accounts are confirmed on creation (`email_confirm: true`), so
    // sign them in right here — creating the account *is* the first sign-in, no
    // separate step. Email accounts can't have a session until they click the
    // verification link, so those still fall through to the "check your inbox"
    // card. `createClient()` is cookie-bound in a Server Action, so this writes
    // the session cookies for the very next request.
    if (!usesRealEmail) {
      const supabase = await createClient();
      const { error: sessionError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!sessionError) {
        return {
          ok: true,
          username,
          identifier: username,
          requiresEmailVerification: false,
          signedIn: true,
          redirectTo: afterOnboarding,
        };
      }
      // If auto-sign-in somehow fails, don't lose the finished account — fall
      // through to the manual sign-in card so they can still get in.
    }

    return {
      ok: true,
      username,
      identifier: usesRealEmail ? email : username,
      requiresEmailVerification: usesRealEmail,
    };
  } catch (error) {
    console.error('[auth:signup:error]', error);
    return failure(
      'SB-AUTH-SIGNUP',
      'Account creation is temporarily unavailable. Please try again.',
    );
  }
}

/**
 * Find the auth account whose canonical login email exactly matches. Profiles
 * are user-writable, so `profiles.contact_email` must never decide which auth
 * account receives a confirmation or recovery token.
 */
async function authUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('auth_user_id_by_email', {
    p_email: email,
  });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

/**
 * Resolve a recovery request without trusting a self-writable profile email.
 * Canonical auth email wins; a verified contact remains a valid recovery path
 * for username accounts whose auth email is intentionally synthetic.
 */
async function resolveResetUserId(
  admin: ReturnType<typeof createAdminClient>,
  normalized: string,
): Promise<string | null> {
  if (isEmailIdentifier(normalized)) {
    const authUserId = await authUserIdByEmail(admin, normalized);
    if (authUserId) return authUserId;

    const { data: verified } = await admin
      .from('profile_contacts')
      .select('user_id')
      .eq('kind', 'email')
      .eq('normalized_value', normalized)
      .not('verified_at', 'is', null)
      .maybeSingle();
    return verified?.user_id ?? null;
  }

  if (!isValidUsername(normalized)) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', normalized)
    .maybeSingle();
  return profile?.id ?? null;
}

/**
 * Send a fresh confirmation link to an email sign-up that never confirmed.
 *
 * Before this existed, a confirmation email that was spam-foldered or dropped
 * by the recipient's provider left the account permanently unreachable: the
 * password was right, sign-in refused it, and nothing in the app would send a
 * second link. (`Forgot password?` happens to confirm the address too, but only
 * if the reader guesses that a password they know is fine needs "resetting".)
 *
 * Enumeration-safe in the same shape as `requestPasswordReset`: every outcome
 * that isn't a server fault returns the same generic ok, so a caller learns
 * nothing about whether the address has an account (docs/SECURITY.md §9).
 */
export async function resendEmailConfirmation(
  identifier: string,
): Promise<AuthActionResult> {
  const normalized = normalizeIdentifier(identifier);
  const generic: AuthActionResult = { ok: true, identifier: normalized };
  if (!isEmailIdentifier(normalized)) {
    return validation('Enter the email address you signed up with.');
  }
  if (!hasAdminCredentials() || !emailEnabled()) {
    return failure('SB-CONFIG-EMAIL');
  }

  try {
    if (!(await checkRateLimit(
      `resend-confirm:${normalized}`,
      3,
      60 * 60,
      { failClosed: true },
    ))) {
      return generic;
    }

    const admin = createAdminClient();
    // Resolve through the same path a reset uses, so this can only ever act on
    // an account that already claims this address — never mint a user as a side
    // effect of asking for a link.
    const userId = await resolveResetUserId(admin, normalized);
    if (!userId) return generic;

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const user = authUser.user;
    // Already confirmed, or a username account whose login email is synthetic
    // and undeliverable: nothing to re-send, and nowhere to send it.
    if (
      !user?.email ||
      user.email_confirmed_at ||
      !looksLikeEmail(user.email) ||
      user.email.endsWith(`@${USERNAME_EMAIL_DOMAIN}`)
    ) {
      return generic;
    }

    // A magic link is the one link type that both proves control of the address
    // and confirms it on the way through, so this lands them signed in rather
    // than back at a form. `/auth/confirm` records the ownership proof.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
      options: { redirectTo: appUrl('/auth/confirm?next=/onboarding') },
    });
    if (linkError) {
      return reportAndFail('SB-AUTH-RESEND', 'auth.resend-confirmation', linkError);
    }

    const hashed = link.properties?.hashed_token;
    const confirmUrl = hashed
      ? appUrl(
          `/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=magiclink&next=${encodeURIComponent('/onboarding')}`,
        )
      : link.properties?.action_link;
    if (!confirmUrl) {
      return reportAndFail('SB-AUTH-RESEND', 'auth.resend-confirmation', {
        message: 'missing_confirmation_url',
      });
    }

    const delivery = await sendEmailWithResult({
      to: user.email,
      subject: 'Confirm your Switchboard account',
      text:
        `Confirm your Switchboard email and finish signing in:\n\n${confirmUrl}\n\n` +
        `If you did not create this account, ignore this message.`,
    });
    if (delivery.status !== 'sent') {
      return reportAndFail('SB-AUTH-RESEND', 'auth.resend-confirmation', {
        message: `delivery_${delivery.status}`,
        code: delivery.errorCode,
      });
    }

    return generic;
  } catch (error) {
    return reportAndFail('SB-AUTH-RESEND', 'auth.resend-confirmation', error);
  }
}

export async function requestPasswordReset(
  identifier: string,
): Promise<AuthActionResult> {
  const normalized = normalizeIdentifier(identifier);
  const generic: AuthActionResult = { ok: true, identifier: normalized };
  if (!normalized) return validation('Enter your email or username.');

  try {
    if (!(await checkRateLimit(
      `reset:${normalized}`,
      3,
      60 * 60,
      { failClosed: true },
    ))) {
      return generic;
    }

    // The durable limiter and the canonical auth-email resolver both require
    // the service role. `checkRateLimit(..., { failClosed: true })` already
    // refuses this state; keep the explicit guard so a future limiter refactor
    // cannot accidentally bypass the recovery security boundary.
    if (!hasAdminCredentials()) {
      return generic;
    }

    const admin = createAdminClient();
    const userId = await resolveResetUserId(admin, normalized);
    if (!userId) return generic;

    // Decide where the recovery link may be delivered. An account's own login
    // email is its canonical recovery address, so email sign-ups always recover
    // there — even before the contact row is marked verified. Username accounts
    // have a synthetic, undeliverable login email, so they may only recover
    // through a *verified* real-email contact — never an address someone merely
    // typed in but never proved they control (docs/SECURITY.md §9).
    const { data: authUser, error: authUserError } =
      await admin.auth.admin.getUserById(userId);
    if (authUserError) {
      console.error('[auth:reset-request:user-lookup]', {
        code: authUserError.code ?? 'unknown',
        status: authUserError.status ?? null,
      });
    }
    const authEmail = authUser.user?.email ?? null;
    const loginEmailDeliverable =
      !!authEmail &&
      looksLikeEmail(authEmail) &&
      !authEmail.endsWith(`@${USERNAME_EMAIL_DOMAIN}`);

    let deliverTo: string | null = loginEmailDeliverable ? authEmail : null;
    if (!deliverTo) {
      const { data: verifiedEmail } = await admin
        .from('profile_contacts')
        .select('normalized_value')
        .eq('user_id', userId)
        .eq('kind', 'email')
        .not('verified_at', 'is', null)
        .maybeSingle();
      deliverTo = verifiedEmail?.normalized_value ?? null;
    }

    if (authEmail && deliverTo) {
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: authEmail,
        options: { redirectTo: appUrl('/auth/confirm?next=/reset-password') },
      });
      if (linkError) {
        console.error('[auth:reset-request:link]', {
          code: linkError.code ?? 'unknown',
          status: linkError.status ?? null,
        });
      }
      // Build the link through our own /auth/confirm route using the token
      // hash, so recovery never depends on Supabase's verify-redirect or a
      // particular email-template shape. Fall back to the raw action link.
      const hashed = link.properties?.hashed_token;
      const recoveryUrl = hashed
        ? appUrl(`/auth/confirm?token_hash=${hashed}&type=recovery&next=/reset-password`)
        : link.properties?.action_link;
      if (recoveryUrl) {
        const delivery = await sendEmailWithResult({
          to: deliverTo,
          subject: 'Reset your Switchboard password',
          text: `Reset your Switchboard password:\n\n${recoveryUrl}\n\nIf you did not request this, you can ignore this email.`,
        });
        if (delivery.status !== 'sent') {
          console.error('[auth:reset-request:delivery]', {
            status: delivery.status,
            code: delivery.errorCode ?? null,
          });
        }
      } else if (!linkError) {
        console.error('[auth:reset-request:link]', {
          code: 'missing_recovery_url',
          status: null,
        });
      }
    }

    return generic;
  } catch (error) {
    console.error('[auth:reset-request:error]', error);
    return generic;
  }
}

export async function updatePassword(password: string): Promise<AuthActionResult> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return validation(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return failure(
        'SB-AUTH-RESET',
        'Could not update your password. Request a fresh reset link.',
      );
    }
    return { ok: true };
  } catch (error) {
    console.error('[auth:password-update:error]', error);
    return failure('SB-AUTH-RESET', 'Could not update your password right now.');
  }
}
