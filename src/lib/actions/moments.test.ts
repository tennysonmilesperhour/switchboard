import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  notifyUsers: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => true),
}));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async () => ({
    ok: false,
    code: 'SB-MOMENT-SAVE',
    error: 'Could not verify this moment.',
    fix: 'Refresh Moments and try again.',
  })),
}));

import { acceptMoment, expressCuriosity } from './moments';

function readBuilder(data: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return builder;
}

function arrangePair(blocked = true) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'find_shared_moments') {
      return { data: [{ id: 'moment-other' }], error: null };
    }
    if (name === 'is_blocked_with') return { data: blocked, error: null };
    return { data: null, error: null };
  });
  const supabase = {
    from: vi.fn(() => readBuilder({
      id: 'moment-mine',
      user_id: 'user-mine',
      place_name: 'Union Station',
    })),
    rpc,
  };
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'user-mine' },
    supabase,
  });
  mocks.adminFrom.mockImplementation((table: string) =>
    readBuilder(
      table === 'moments'
        ? { user_id: 'user-other', place_name: 'Union Station' }
        : null,
    ),
  );
  mocks.createAdminClient.mockReturnValue({ from: mocks.adminFrom });
  return { rpc };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Moments block recheck', () => {
  it.each([
    ['express curiosity', expressCuriosity],
    ['accept a moment', acceptMoment],
  ])('refuses to %s after either person blocks', async (_label, action) => {
    const { rpc } = arrangePair();

    const result = await action('moment-mine', 'moment-other');

    expect(result).toMatchObject({ ok: false, code: 'SB-MOMENT-ACCESS' });
    expect(rpc).toHaveBeenCalledWith('is_blocked_with', {
      p_other: 'user-other',
    });
    // Resolving the candidate for the check is allowed; no interest write and
    // no notification may happen after that check says the pair is blocked.
    expect(mocks.adminFrom).toHaveBeenCalledWith('moments');
    expect(mocks.adminFrom).not.toHaveBeenCalledWith('moment_interests');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('does not let an anonymous caller skip straight to acceptance', async () => {
    arrangePair(false);

    const result = await acceptMoment('moment-mine', 'moment-other');

    expect(result).toMatchObject({ ok: false, code: 'SB-MOMENT-ACCESS' });
    expect(mocks.adminFrom).toHaveBeenCalledWith('moment_interests');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});
