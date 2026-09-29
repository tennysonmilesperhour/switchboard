import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  memberDelete: vi.fn(),
  responseDelete: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: mocks.requireUser,
  requireUserOrRedirect: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code })),
  reportOperationalError: vi.fn(),
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/actions/events', () => ({ createEvent: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ capture: vi.fn() }));

import { leaveBoard, setBoardMemberRole, withdrawBoardResponse } from './boards';

function chain(result: () => unknown) {
  const node: Record<string, unknown> = {};
  node.eq = () => node;
  node.select = result;
  node.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'me' },
    supabase: {
      rpc: mocks.rpc,
      from: (table: string) => ({
        delete: () =>
          chain(table === 'board_members' ? mocks.memberDelete : mocks.responseDelete),
      }),
    },
  });
});

describe('leaving a board', () => {
  it('leaves', async () => {
    mocks.memberDelete.mockResolvedValue({ data: [{ member_id: 'me' }], error: null });
    expect(await leaveBoard('board-1')).toEqual({ ok: true });
  });

  it('tells the last moderator to hand the board on first, instead of an error code', async () => {
    mocks.memberDelete.mockResolvedValue({
      data: null,
      error: { message: 'last moderator', code: 'P0001' },
    });
    const result = await leaveBoard('board-1');
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('code');
    expect(result.error).toMatch(/Make someone else a moderator/);
  });
});

describe('board roles', () => {
  it('goes through set_board_member_role', async () => {
    mocks.rpc.mockResolvedValue({ data: 'updated', error: null });
    expect(await setBoardMemberRole('board-1', 'neighbor', 'moderator')).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('set_board_member_role', {
      p_board: 'board-1',
      p_member: 'neighbor',
      p_role: 'moderator',
    });
  });

  it.each([
    ['last_moderator', /at least one moderator/],
    ['founder', /started the board/],
    ['not_member', /no longer on this board/],
  ])('explains %s', async (outcome, message) => {
    mocks.rpc.mockResolvedValue({ data: outcome, error: null });
    const result = await setBoardMemberRole('board-1', 'neighbor', 'member');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(message);
  });

  it('answers a non-moderator with a permission code, not an outage', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'not a moderator of this board' } });
    expect(await setBoardMemberRole('board-1', 'neighbor', 'moderator')).toMatchObject({
      ok: false,
      code: 'SB-PERM-DENIED',
    });
  });
});

describe('taking back an offer to help', () => {
  it('deletes only the caller’s own response', async () => {
    mocks.responseDelete.mockResolvedValue({ error: null });
    expect(await withdrawBoardResponse('post-1', 'maple-street')).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/boards/maple-street');
  });
});
