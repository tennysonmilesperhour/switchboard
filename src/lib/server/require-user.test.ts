import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import { getOptionalUser, requireUser } from './require-user';

describe('shared action authentication', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.createClient.mockReset();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it('returns the registered signed-out failure shape', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireUser()).resolves.toEqual({
      ok: false,
      code: 'SB-AUTH-REQUIRED',
      error: 'You need to be signed in to do that.',
      fix: 'Sign in and try again.',
    });
  });

  it('returns the validated user with the same session client', async () => {
    const user = { id: 'user-1' };
    mocks.getUser.mockResolvedValue({ data: { user } });

    const result = await requireUser();

    expect(result).toMatchObject({ ok: true, user });
    if (result.ok) expect(result.supabase.auth.getUser).toBe(mocks.getUser);
  });

  it('refuses a session a moderator has since suspended, naming the suspension', async () => {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', banned_until: until } } });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('SB-AUTH-SUSPENDED');
      expect(result.error).not.toMatch(/signed in to do that/);
    }
  });

  it('names the suspension when the auth server answers user_banned with no user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 403, code: 'user_banned', message: 'User is banned' },
    });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SB-AUTH-SUSPENDED');
  });

  it('lets a suspension that has run out through', async () => {
    const user = { id: 'user-1', banned_until: '2020-01-01T00:00:00Z' };
    mocks.getUser.mockResolvedValue({ data: { user } });

    await expect(requireUser()).resolves.toMatchObject({ ok: true, user });
  });

  it('keeps anonymous identity reads explicit', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await getOptionalUser();

    expect(result.user).toBeNull();
    expect(result.supabase.auth.getUser).toBe(mocks.getUser);
  });
});
