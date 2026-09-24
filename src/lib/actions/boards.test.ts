import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  notifyUsers: vi.fn(),
  revalidatePath: vi.fn(),
  memberDelete: vi.fn(),
  postDelete: vi.fn(),
  memberInsert: vi.fn(),
  myRole: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: mocks.requireUser,
  requireUserOrRedirect: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code })),
  reportOperationalError: vi.fn(),
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/actions/events', () => ({ createEvent: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ capture: vi.fn() }));

import { deleteBoardPost, inviteToBoard, removeFromBoard } from './boards';

function eqChain(result: () => unknown) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.select = result;
  chain.maybeSingle = result;
  return chain;
}

function supabase() {
  return {
    from: (table: string) => {
      if (table === 'board_members') {
        return {
          delete: () => eqChain(mocks.memberDelete),
          insert: mocks.memberInsert,
          select: () => eqChain(mocks.myRole),
        };
      }
      if (table === 'board_posts') return { delete: () => eqChain(mocks.postDelete) };
      if (table === 'profiles') {
        return { select: () => eqChain(async () => ({ data: { id: 'user-2' } })) };
      }
      if (table === 'boards') {
        return {
          select: () => eqChain(async () => ({ data: { name: 'Maple Street', slug: 'maple-street' } })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ ok: true, user: { id: 'user-1' }, supabase: supabase() });
  mocks.memberDelete.mockResolvedValue({ data: [], error: null });
  mocks.postDelete.mockResolvedValue({ data: [], error: null });
  mocks.memberInsert.mockResolvedValue({ error: null });
  mocks.myRole.mockResolvedValue({ data: { role: 'moderator' } });
});

describe('board actions', () => {
  it('does not call an RLS-refused member removal a success', async () => {
    const result = await removeFromBoard('board-1', 'user-2');

    expect(result).toMatchObject({ ok: false, code: 'SB-PERM-DENIED' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not call an RLS-refused post removal a success', async () => {
    const result = await deleteBoardPost('post-1', 'maple-street');

    expect(result).toMatchObject({ ok: false, code: 'SB-PERM-DENIED' });
  });

  it('removes a post the caller may remove', async () => {
    mocks.postDelete.mockResolvedValue({ data: [{ id: 'post-1' }], error: null });

    const result = await deleteBoardPost('post-1', 'maple-street');

    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/boards/maple-street');
  });

  it('tells someone they were added to a board', async () => {
    const result = await inviteToBoard('board-1', '@sam');

    expect(result).toEqual({ ok: true });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['user-2'],
      expect.objectContaining({ kind: 'board_added', url: '/boards/maple-street' }),
    );
  });
});
