import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every way into an account names a suspension (docs/AUTH.md, finding 16).
 * The auth server refuses a suspended account's email link and Google
 * round trip with `user_banned`; before, the first read as "expired or already
 * used" and the second as a denied Google sign-in, neither of which is true.
 */

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  reportOperationalError: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: () => false,
  createAdminClient: () => {
    throw new Error('not used');
  },
}));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { GET as confirm } from './confirm/route';
import { GET as callback } from './callback/route';

const BANNED = { code: 'user_banned', status: 403, message: 'User is banned' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/auth/confirm', () => {
  it('sends a good link for a suspended account to the suspension, not "expired"', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: BANNED });

    const response = await confirm(
      new Request('https://switchboardsocial.me/auth/confirm?token_hash=abc&type=recovery'),
    );

    expect(response.headers.get('location')).toBe(
      'https://switchboardsocial.me/login?error=suspended',
    );
  });

  it('still calls an expired link expired', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired', status: 403 } });

    const response = await confirm(
      new Request('https://switchboardsocial.me/auth/confirm?token_hash=abc&type=signup'),
    );

    expect(response.headers.get('location')).toContain('error=auth');
  });
});

describe('/auth/callback', () => {
  it('names a suspension the auth server reports on the way back from Google', async () => {
    const response = await callback(
      new Request(
        'https://switchboardsocial.me/auth/callback?error=access_denied&error_code=user_banned&error_description=User+is+banned',
      ),
    );

    expect(response.headers.get('location')).toBe(
      'https://switchboardsocial.me/login?error=suspended',
    );
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });

  it('names a suspension refused at the code exchange', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: BANNED });

    const response = await callback(
      new Request('https://switchboardsocial.me/auth/callback?code=xyz'),
    );

    expect(response.headers.get('location')).toBe(
      'https://switchboardsocial.me/login?error=suspended',
    );
  });

  it('still reports a denied Google sign-in as denied', async () => {
    const response = await callback(
      new Request('https://switchboardsocial.me/auth/callback?error=access_denied'),
    );

    expect(response.headers.get('location')).toContain('error=oauth_provider');
  });
});
