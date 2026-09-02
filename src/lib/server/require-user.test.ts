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

  it('keeps anonymous identity reads explicit', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await getOptionalUser();

    expect(result.user).toBeNull();
    expect(result.supabase.auth.getUser).toBe(mocks.getUser);
  });
});
