'use server';

import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import {
  appUrl,
  emailEnabled,
  sendEmail,
  sendEmailWithResult,
} from '@/lib/server/email';
import { redirect } from 'next/navigation';
import {
  PASSWORD_MIN_LENGTH,
  emailToHandleCandidate,
  isEmailIdentifier,
  isValidUsername,
  normalizeIdentifier,
  normalizeUsername,
  usernameToAuthEmail,
} from '@/lib/auth-identity';
import { LEGAL_VERSION } from '@/lib/legal';
import { safeNextPath } from '@/lib/security';

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  username?: string;
  identifier?: string;
  requiresEmailVerification?: boolean;
  /** True when account creation also established a session (username signups). */
  signedIn?: boolean;
  /** Where the client should navigate once auto-signed-in. */
  redirectTo?: string;
}

function authError(message: string): AuthActionResult {
  return { ok: false, error: message };
}

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
    return authError('Enter your email or username and password.');
  }
  if (!isEmailIdentifier(normalized) && !isValidUsername(normalized)) {
    return authError('That email, username, or password did not work.');
  }

  try {
    const allowed = await checkRateLimit(`signin:${normalized}`, 8, 10 * 60);
    if (!allowed) {
      return authError('Too many sign-in attempts. Wait a few minutes and try again.');
    }

    const emails = await resolveIdentifierEmails(normalized);
    const supabase = await createClient();
    for (const email of emails) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!error) return { ok: true };
    }

    return authError('That email, username, or password did not work.');
  } catch (error) {
    console.error('[auth:signin:error]', error);
    return authError('Sign-in is temporarily unavailable. Please try again in a moment.');
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

  if (!displayName) return authError('Add your name.');
  if (!isEmailIdentifier(identifier) && !isValidUsername(identifier)) {
    return authError('Use a valid email or a username with 3-24 letters, numbers, or underscores.');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return authError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (!acceptedTerms || !acceptedCovenant) {
    return authError('Please acknowledge the Terms, Privacy Notice, and Community Covenant.');
  }

  if (!hasAdminCredentials()) {
    return authError('Account creation is not configured on this server yet.');
  }

  try {
    const allowed = await checkRateLimit(`signup:${identifier}`, 4, 60 * 60);
    if (!allowed) {
      return authError('Too many account attempts. Wait a while and try again.');
    }

    const admin = createAdminClient();
    const usesRealEmail = isEmailIdentifier(identifier);
    if (usesRealEmail && !emailEnabled()) {
      return authError('Email account creation is not configured on this server yet.');
    }
    const email = usesRealEmail
      ? identifier
      : usernameToAuthEmail(identifier);
    const username = usesRealEmail
      ? await uniqueHandle(emailToHandleCandidate(identifier))
      : normalizeUsername(identifier);

    if (!username) return authError('Could not create a unique username for that email.');

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', username)
      .maybeSingle();

    if (existingProfile) return authError('That username is already taken.');

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
        return authError('That email or username is already taken.');
      }
      return authError(createError.message);
    }

    if (!userId) return authError('Could not create that account.');

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
        return authError('That username is already taken.');
      }
      return authError('Could not finish creating your profile.');
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
        return authError('Could not attach that email to the new account. No account was created.');
      }
    }

    if (usesRealEmail) {
      if (!confirmationUrl) {
        await admin.auth.admin.deleteUser(userId);
        return authError('Could not create a verification link for that email.');
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
        return authError('The confirmation email could not be sent. No account was created.');
      }
    }

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
    return authError('Account creation is temporarily unavailable. Please try again.');
  }
}

export async function requestPasswordReset(
  identifier: string,
): Promise<AuthActionResult> {
  const normalized = normalizeIdentifier(identifier);
  const generic = {
    ok: true,
    identifier: normalized,
  };
  if (!normalized) return authError('Enter your email or username.');

  try {
    if (!(await checkRateLimit(`reset:${normalized}`, 3, 60 * 60))) {
      return generic;
    }

    const supabase = await createClient();
    if (isEmailIdentifier(normalized)) {
      const { data: verifiedContact } = hasAdminCredentials()
        ? await createAdminClient()
            .from('profile_contacts')
            .select('user_id')
            .eq('kind', 'email')
            .eq('normalized_value', normalized)
            .not('verified_at', 'is', null)
            .maybeSingle()
        : { data: null };

      if (!verifiedContact?.user_id) {
        await supabase.auth.resetPasswordForEmail(normalized, {
          redirectTo: appUrl('/auth/callback?next=/reset-password'),
        });
        return generic;
      }
    }

    if (hasAdminCredentials()) {
      const admin = createAdminClient();
      let userId: string | null = null;
      if (isEmailIdentifier(normalized)) {
        const { data: identity } = await admin
          .from('profile_contacts')
          .select('user_id')
          .eq('kind', 'email')
          .eq('normalized_value', normalized)
          .not('verified_at', 'is', null)
          .maybeSingle();
        userId = identity?.user_id ?? null;
      } else {
        const { data: identity } = await admin
          .from('profiles')
          .select('id')
          .eq('handle', normalized)
          .maybeSingle();
        userId = identity?.id ?? null;
      }
      const { data: verifiedEmail } = userId
        ? await admin
            .from('profile_contacts')
            .select('normalized_value')
            .eq('user_id', userId)
            .eq('kind', 'email')
            .not('verified_at', 'is', null)
            .maybeSingle()
        : { data: null };

      if (userId && verifiedEmail?.normalized_value) {
        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        if (authUser.user?.email) {
          const { data: link } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: authUser.user.email,
            options: { redirectTo: appUrl('/auth/confirm?next=/reset-password') },
          });
          // Build the link through our own /auth/confirm route using the token
          // hash, so recovery never depends on Supabase's verify-redirect or a
          // particular email-template shape. Fall back to the raw action link.
          const hashed = link.properties?.hashed_token;
          const recoveryUrl = hashed
            ? appUrl(`/auth/confirm?token_hash=${hashed}&type=recovery&next=/reset-password`)
            : link.properties?.action_link;
          if (recoveryUrl) {
            await sendEmail({
              to: verifiedEmail.normalized_value,
              subject: 'Reset your Switchboard password',
              text: `Reset your Switchboard password:\n\n${recoveryUrl}\n\nIf you did not request this, you can ignore this email.`,
            });
          }
        }
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
    return authError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return authError('Could not update your password. Request a fresh reset link.');
    return { ok: true };
  } catch (error) {
    console.error('[auth:password-update:error]', error);
    return authError('Could not update your password right now.');
  }
}

export async function deleteAccount(confirmation: string): Promise<AuthActionResult> {
  if (confirmation.trim().toUpperCase() !== 'DELETE') {
    return authError('Type DELETE to confirm.');
  }
  if (!hasAdminCredentials()) {
    return authError('Account deletion is not configured on this server.');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return authError('Sign in again before deleting your account.');

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('[auth:delete-account:error]', error);
    return authError('Could not delete your account right now.');
  }
  await supabase.auth.signOut();
  redirect('/welcome?account=deleted');
}
