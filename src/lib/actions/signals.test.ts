import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  calls: [] as string[],
  insertResult: { data: [{ id: '11111111-1111-4111-8111-111111111111' }], error: null } as {
    data: { id: string; label?: string }[] | null;
    error: unknown;
  },
  deleteNot: vi.fn(),
  notifyNearby: vi.fn(async () => 0),
  afterTasks: [] as Array<() => unknown>,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    mocks.afterTasks.push(task);
  },
}));
vi.mock('@/lib/server/signal-nearby', () => ({ notifyNearbyFriends: mocks.notifyNearby }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code })),
}));

import { activateSignals } from './signals';

function supabase() {
  return {
    rpc: async () => ({ error: null }),
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { sabbatical: false } }) }) }),
        };
      }
      if (table === 'availability_signals') {
        return {
          insert: () => ({
            select: async () => {
              mocks.calls.push('insert');
              return mocks.insertResult;
            },
          }),
          delete: () => ({
            eq: () => ({
              in: () => ({
                not: (...args: unknown[]) => {
                  mocks.calls.push('delete');
                  return mocks.deleteNot(...args);
                },
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.afterTasks.length = 0;
  mocks.insertResult = {
    data: [{ id: '11111111-1111-4111-8111-111111111111', label: 'Coffee' }],
    error: null,
  };
  mocks.deleteNot.mockResolvedValue({ error: null });
  mocks.requireUser.mockResolvedValue({ ok: true, user: { id: 'user-1' }, supabase: supabase() });
});

describe('activateSignals', () => {
  it('saves the new signal before removing the one it replaces', async () => {
    const result = await activateSignals([{ emoji: '☕', label: 'Coffee' }], {
      circleIds: [],
      personIds: [],
      boardIds: [],
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.calls).toEqual(['insert', 'delete']);
    expect(mocks.deleteNot).toHaveBeenCalledWith(
      'id',
      'in',
      '(11111111-1111-4111-8111-111111111111)',
    );
  });

  it('tells nearby friends only after the status has saved', async () => {
    await activateSignals([{ emoji: '☕', label: 'Coffee' }], {
      circleIds: [],
      personIds: [],
      boardIds: [],
    });

    // Scheduled, not awaited: turning a status on never waits on the notices.
    expect(mocks.notifyNearby).not.toHaveBeenCalled();
    for (const task of mocks.afterTasks) await task();
    expect(mocks.notifyNearby).toHaveBeenCalledWith('user-1', [
      { id: '11111111-1111-4111-8111-111111111111', label: 'Coffee' },
    ]);
  });

  it('tells nobody when the status did not save', async () => {
    mocks.insertResult = { data: null, error: { message: 'boom' } };

    await activateSignals([{ emoji: '☕', label: 'Coffee' }], {
      circleIds: [],
      personIds: [],
      boardIds: [],
    });

    expect(mocks.afterTasks).toHaveLength(0);
  });

  it('leaves the live signal alone when the new one fails to save', async () => {
    mocks.insertResult = { data: null, error: { message: 'boom' } };

    const result = await activateSignals([{ emoji: '☕', label: 'Coffee' }], {
      circleIds: [],
      personIds: [],
      boardIds: [],
    });

    expect(result).toMatchObject({ ok: false, code: 'SB-SIGNAL-SAVE' });
    expect(mocks.calls).toEqual(['insert']);
  });
});
