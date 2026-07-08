'use server';

import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import {
  PASSWORD_MIN_LENGTH,
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from '@/lib/auth-identity';

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  username?: string;
}

function authError(message: string): AuthActionResult {
  return { ok: false, error: message };
}

export async function createPasswordAccount(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const displayName = String(formData.get('display_name') ?? '').trim();
  const username = normalizeUsername(String(formData.get('username') ?? ''));
  const password = String(formData.get('password') ?? '');

  if (!displayName) return authError('Add your name.');
  if (!isValidUsername(username)) {
    return authError('Username: 3-24 lowercase letters, numbers, or underscores.');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return authError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (!hasAdminCredentials()) {
    return authError('Account creation is not configured on this server yet.');
  }

  const admin = createAdminClient();
  const email = usernameToAuthEmail(username);

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
      return authError('That username is already taken.');
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
    })
    .eq('id', userId);

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    if (profileError.code === '23505') {
      return authError('That username is already taken.');
    }
    return authError('Could not finish creating your profile.');
  }

  return { ok: true, username };
}
