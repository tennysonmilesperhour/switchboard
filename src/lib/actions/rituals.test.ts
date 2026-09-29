import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateSelect: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed' })),
}));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({
    ok: true,
    user: { id: 'partner' },
    supabase: {
      from: (table: string) => {
        if (table === 'rituals') {
          const chain = { eq: () => chain, select: mocks.updateSelect };
          return { update: () => chain };
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Pat' } }) }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    },
  }),
}));

import { respondToRitual } from './rituals';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateSelect.mockResolvedValue({
    data: [{ creator_id: 'creator', activity: 'Coffee' }],
    error: null,
  });
});

describe('respondToRitual', () => {
  it('tells the proposer when their ritual is accepted', async () => {
    const result = await respondToRitual('r1', true);

    expect(result).toEqual({ ok: true });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['creator'],
      expect.objectContaining({ kind: 'ritual', url: '/mutual' }),
    );
  });

  it('keeps a decline quiet', async () => {
    const result = await respondToRitual('r1', false);

    expect(result).toEqual({ ok: true });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('does not report success when nothing was left to answer', async () => {
    mocks.updateSelect.mockResolvedValue({ data: [], error: null });

    const result = await respondToRitual('r1', true);

    expect(result.ok).toBe(false);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});
