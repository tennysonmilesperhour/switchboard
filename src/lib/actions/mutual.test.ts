import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  notifyUsers: vi.fn(async () => undefined),
  notifyInterestReceived: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/server/notify', () => ({
  notifyUsers: mocks.notifyUsers,
  notifyInterestReceived: mocks.notifyInterestReceived,
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true) }));
vi.mock('@/lib/server/observability', () => ({ reportAndFail: vi.fn() }));

import { downToConnect } from './mutual';

afterEach(() => vi.clearAllMocks());

describe('downToConnect', () => {
  /**
   * Re-sending an interest that had already matched used to reset the
   * caller's side to active: the other person got a fresh anonymous nudge,
   * and a tap back matched the pair again with a second room.
   */
  it('leaves an existing match alone', async () => {
    const upsert = vi.fn();
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: { status: 'matched' }, error: null }),
      upsert,
    };
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'me' },
      supabase: { from: () => builder },
    });

    const result = await downToConnect('them', 'Coffee');

    expect(result).toEqual({ ok: true, matched: true });
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.notifyInterestReceived).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});
