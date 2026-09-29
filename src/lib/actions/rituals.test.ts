import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateSelect: vi.fn(),
  notifyUsers: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(async () => ({ error: null })),
  away: [] as Array<{ id: string; display_name: string }>,
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
          return { update: () => chain, insert: mocks.insert };
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Pat' } }) }),
              // The sabbatical check before a proposal.
              in: () => ({ eq: async () => ({ data: mocks.away, error: null }) }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      rpc: mocks.rpc,
    },
  }),
}));

import { proposeRitual, respondToRitual, skipRitual } from './rituals';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.away = [];
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

describe('proposeRitual and sabbatical (D6)', () => {
  it('asks a connection who is around', async () => {
    const result = await proposeRitual('friend', 'Coffee', 21);

    expect(result).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['friend'], expect.objectContaining({ kind: 'ritual' }));
  });

  it('does not ask someone on sabbatical, and says so without a code', async () => {
    mocks.away = [{ id: 'friend', display_name: 'Sam' }];

    const result = await proposeRitual('friend', 'Coffee', 21);

    expect(result).toEqual({
      ok: false,
      error: 'Sam is on sabbatical right now. Try again when they’re back.',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('does not let someone on sabbatical start one', async () => {
    mocks.away = [{ id: 'partner', display_name: 'Me' }];

    const result = await proposeRitual('friend', 'Coffee', 21);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('paused while you’re on sabbatical');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('skipRitual (D8)', () => {
  it('skips the named occurrence through the database, which checks the caller', async () => {
    mocks.rpc.mockResolvedValue({ data: 'skipped', error: null });

    const result = await skipRitual('r1', '2026-09-29');

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('skip_ritual', { p_ritual: 'r1', p_due_on: '2026-09-29' });
    // Guilt-free: the other person is not told.
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it.each([
    ['already_moved', 'already skipped or planned'],
    ['not_due', 'isn’t due yet'],
    ['not_active', 'paused or ended'],
    ['not_found', 'isn’t one of yours'],
  ])('explains %s in a sentence, without a code', async (outcome, words) => {
    mocks.rpc.mockResolvedValue({ data: outcome, error: null });

    const result = await skipRitual('r1', '2026-09-29');

    expect(result.ok).toBe(false);
    expect(result.error).toContain(words);
    expect(result.code).toBeUndefined();
  });

  it('reports a failed call with the ritual code', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await skipRitual('r1', '2026-09-29');

    expect(result).toEqual({ ok: false, code: 'SB-RITUAL-SAVE', error: 'failed' });
  });

  it('refuses a date that is not a date before calling anything', async () => {
    const result = await skipRitual('r1', 'tomorrow');

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
