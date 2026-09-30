import { beforeEach, describe, expect, it, vi } from 'vitest';

const ME = '00000000-0000-0000-0000-000000000001';
const QUIET_FRIEND = '00000000-0000-0000-0000-000000000002';
const SPACE_FRIEND = '00000000-0000-0000-0000-000000000003';

const mocks = vi.hoisted(() => ({ avoids: vi.fn() }));

const longAgo = '2026-01-01T00:00:00Z';

function friend(id: string, name: string) {
  return {
    created_at: longAgo,
    requester_id: '00000000-0000-0000-0000-000000000001',
    addressee_id: id,
    requester: { id: '00000000-0000-0000-0000-000000000001', display_name: 'Me', sabbatical: false },
    addressee: { id, display_name: name, sabbatical: false },
  };
}

// Every admin query resolves to a canned result keyed by table.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result =
        table === 'connections'
          ? {
              data: [
                friend('00000000-0000-0000-0000-000000000002', 'Quiet Friend'),
                friend('00000000-0000-0000-0000-000000000003', 'Space Friend'),
              ],
            }
          : { data: [] };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'or', 'in']) chain[method] = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return chain;
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: async () => mocks.avoids() }),
    }),
  }),
}));

import { getReconnectionSuggestions } from './radar';

beforeEach(() => {
  mocks.avoids.mockReturnValue({ data: [{ avoided_id: SPACE_FRIEND }], error: null });
});

describe('getReconnectionSuggestions (G8)', () => {
  it('never suggests someone the viewer gives space to', async () => {
    const suggestions = await getReconnectionSuggestions(ME, 5);

    expect(suggestions.map((s) => s.friendId)).toEqual([QUIET_FRIEND]);
  });

  it('suggests nobody when the give-space list cannot be read', async () => {
    mocks.avoids.mockReturnValue({ data: null, error: { message: 'boom' } });

    expect(await getReconnectionSuggestions(ME, 5)).toEqual([]);
  });
});
