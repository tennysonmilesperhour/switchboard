import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  blockInsert: vi.fn(),
  avoidInsert: vi.fn(),
  connectionDeleteEq: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn() }));

import { blockProfile, giveSpace } from './connections';

function supabase() {
  return {
    from: (table: string) => {
      if (table === 'profile_blocks') return { insert: mocks.blockInsert };
      if (table === 'profile_avoids') return { insert: mocks.avoidInsert };
      if (table === 'connections') {
        return {
          delete: () => ({ eq: mocks.connectionDeleteEq }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    ok: true,
    supabase: supabase(),
    user: { id: '00000000-0000-0000-0000-000000000001' },
  });
  mocks.blockInsert.mockResolvedValue({ error: null });
  mocks.avoidInsert.mockResolvedValue({ error: null });
  mocks.connectionDeleteEq.mockResolvedValue({ error: null });
});

describe('connection safety actions', () => {
  it('refuses to block the caller before writing anything', async () => {
    const result = await blockProfile(
      '00000000-0000-0000-0000-000000000001',
    );

    expect(result).toEqual({ ok: false, error: 'You cannot block yourself.' });
    expect(mocks.blockInsert).not.toHaveBeenCalled();
  });

  it('treats an existing block as success and removes the old connection', async () => {
    mocks.blockInsert.mockResolvedValue({ error: { code: '23505' } });

    const result = await blockProfile(
      '00000000-0000-0000-0000-000000000002',
      'connection-1',
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.blockInsert).toHaveBeenCalledWith({
      blocker_id: '00000000-0000-0000-0000-000000000001',
      blocked_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(mocks.connectionDeleteEq).toHaveBeenCalledWith('id', 'connection-1');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/people');
  });

  it('validates give-space ids before touching the database', async () => {
    const result = await giveSpace('not-a-uuid');

    expect(result).toEqual({ ok: false, error: 'Unknown person.' });
    expect(mocks.avoidInsert).not.toHaveBeenCalled();
  });

  it('treats an existing give-space preference as a no-op success', async () => {
    mocks.avoidInsert.mockResolvedValue({ error: { code: '23505' } });

    const result = await giveSpace(
      '00000000-0000-0000-0000-000000000002',
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.avoidInsert).toHaveBeenCalledWith({
      avoider_id: '00000000-0000-0000-0000-000000000001',
      avoided_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/people');
  });
});
