import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Hang out again?" after a plan. `answer_hang_again` decides who may answer
 * (pinned by supabase/tests/hang_again.test.sql); these tests pin what the
 * action does with its answer: a refusal says the same thing whatever the
 * reason, a one-sided yes notifies nobody, and only a match tells both people.
 */

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const ME = '00000000-0000-4000-8000-0000000000a1';
const THEM = '00000000-0000-4000-8000-0000000000b2';

const mocks = vi.hoisted(() => ({
  user: { id: '00000000-0000-4000-8000-0000000000a1' } as { id: string } | null,
  rpc: vi.fn(),
  from: vi.fn(),
  notifyUsers: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/server/observability')>();
  return { ...actual, reportOperationalError: vi.fn() };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));

import { answerHangAgain } from './hang-again';

function matchLookup(roomId: string | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: roomId ? { room_id: roomId } : null, error: null }),
  };
  mocks.from.mockReturnValue(chain);
}

beforeEach(() => {
  mocks.user = { id: ME };
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.notifyUsers.mockReset();
});

describe('answerHangAgain', () => {
  it('refuses malformed ids and answering about yourself before calling the database', async () => {
    expect((await answerHangAgain('nope', THEM, true)).ok).toBe(false);
    expect((await answerHangAgain(EVENT, ME, true)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('passes the answer to the definer, which decides who may give it', async () => {
    mocks.rpc.mockResolvedValue({ data: 'saved', error: null });
    await answerHangAgain(EVENT, THEM, false);
    expect(mocks.rpc).toHaveBeenCalledWith('answer_hang_again', {
      p_event: EVENT,
      p_target: THEM,
      p_yes: false,
    });
  });

  it('says the same thing for every refusal, so a block is never revealed', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } });
    const result = await answerHangAgain(EVENT, THEM, true);
    expect(result.ok).toBe(false);
    expect('code' in result && result.code).toBe('SB-HANG-SAVE');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('notifies nobody about a one-sided yes', async () => {
    mocks.rpc.mockResolvedValue({ data: 'saved', error: null });
    const result = await answerHangAgain(EVENT, THEM, true);
    expect(result).toEqual({ ok: true, matched: false });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('tells both people at once on a match, and links the room', async () => {
    mocks.rpc.mockResolvedValue({ data: 'matched', error: null });
    matchLookup('room-1');
    const result = await answerHangAgain(EVENT, THEM, true);
    expect(result).toEqual({ ok: true, matched: true, url: '/rooms/room-1' });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      [ME, THEM],
      expect.objectContaining({ kind: 'match', url: '/rooms/room-1' }),
    );
  });
});
