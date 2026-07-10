'use server';

import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { appUrl, sendEmail } from '@/lib/server/email';
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

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  username?: string;
  identifier?: string;
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
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .ilike('contact_email', normalized)
        .limit(1)
        .maybeSingle();

      if (profile?.id) {
        const { data } = await admin.auth.admin.getUserById(profile.id);
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
    const email = isEmailIdentifier(identifier)
      ? identifier
      : usernameToAuthEmail(identifier);
    const username = isEmailIdentifier(identifier)
      ? await uniqueHandle(emailToHandleCandidate(identifier))
      : normalizeUsername(identifier);

    if (!username) return authError('Could not create a unique username for that email.');

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', username)
      .maybeSingle();

    if (existingProfile) return authError('That username is already taken.');

    const { data, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName.slice(0, 80),
        username,
      },
    });

    if (createError) {
      if (/already|registered|exists/i.test(createError.message)) {
        return authError('That email or username is already taken.');
      }
      return authError(createError.message);
    }

    const userId = data.user?.id;
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

    // contact_email is optional (added by the profile_rich migration) and only
    // powers reset-by-email lookup. Never let its absence — e.g. an incompletely
    // migrated project — block account creation; capture it when the column
    // exists and move on otherwise.
    if (isEmailIdentifier(identifier)) {
      const { error: contactError } = await admin
        .from('profiles')
        .update({ contact_email: email })
        .eq('id', userId);
      if (contactError) {
        console.warn('[auth:signup:contact_email]', contactError.message);
      }
    }

    return { ok: true, username, identifier: isEmailIdentifier(identifier) ? email : username };
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
      const { data: profile } = hasAdminCredentials()
        ? await createAdminClient()
            .from('profiles')
            .select('id')
            .ilike('contact_email', normalized)
            .maybeSingle()
        : { data: null };

      if (!profile?.id) {
        await supabase.auth.resetPasswordForEmail(normalized, {
          redirectTo: appUrl('/auth/callback?next=/reset-password'),
        });
        return generic;
      }
    }

    if (hasAdminCredentials()) {
      const admin = createAdminClient();
      const profileQuery = admin.from('profiles').select('id, contact_email');
      const { data: profile } = isEmailIdentifier(normalized)
        ? await profileQuery.ilike('contact_email', normalized).maybeSingle()
        : await profileQuery.eq('handle', normalized).maybeSingle();

      if (profile?.id && profile.contact_email) {
        const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
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
              to: profile.contact_email,
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
