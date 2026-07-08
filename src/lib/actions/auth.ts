'use server';

import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  PASSWORD_MIN_LENGTH,
  emailToHandleCandidate,
  isEmailIdentifier,
  isValidUsername,
  normalizeIdentifier,
  normalizeUsername,
  usernameToAuthEmail,
} from '@/lib/auth-identity';

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

  let emails: string[];
  try {
    emails = await resolveIdentifierEmails(normalized);
  } catch {
    return authError('That email, username, or password did not work.');
  }

  const supabase = await createClient();
  for (const email of emails) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) return { ok: true };
  }

  return authError('That email, username, or password did not work.');
}

export async function createPasswordAccount(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const displayName = String(formData.get('display_name') ?? '').trim();
  const identifier = normalizeIdentifier(String(formData.get('identifier') ?? ''));
  const password = String(formData.get('password') ?? '');

  if (!displayName) return authError('Add your name.');
  if (!isEmailIdentifier(identifier) && !isValidUsername(identifier)) {
    return authError('Use a valid email or a username with 3-24 letters, numbers, or underscores.');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return authError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (!hasAdminCredentials()) {
    return authError('Account creation is not configured on this server yet.');
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

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      display_name: displayName.slice(0, 80),
      handle: username,
      contact_email: isEmailIdentifier(identifier) ? email : null,
    })
    .eq('id', userId);

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    if (profileError.code === '23505') {
      return authError('That username is already taken.');
    }
    return authError('Could not finish creating your profile.');
  }

  return { ok: true, username, identifier: isEmailIdentifier(identifier) ? email : username };
}
