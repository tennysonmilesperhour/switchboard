import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  zoneSelect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({ reportAndFail: vi.fn() }));

import { ensureZoneInviteLink, setZoneVisibility } from './zones';

function supabase() {
  return {
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table !== 'zones') throw new Error(`Unexpected table: ${table}`);
      return {
        update: () => ({
          eq: () => ({ select: mocks.zoneSelect }),
        }),
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboardsocial.me');
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'user-1' },
    supabase: supabase(),
  });
  mocks.rpc.mockResolvedValue({ data: 'join-code', error: null });
  mocks.zoneSelect.mockResolvedValue({ data: [], error: null });
});

describe('zone actions', () => {
  it('treats an RLS-filtered visibility update as an access failure', async () => {
    const result = await setZoneVisibility('zone-1', 'private');

    expect(result).toMatchObject({ ok: false, code: 'SB-ZONE-ACCESS' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns the minted zone invite URL and revalidates the index', async () => {
    const result = await ensureZoneInviteLink('zone-1');

    expect(mocks.rpc).toHaveBeenCalledWith('ensure_zone_invite_code', {
      p_zone: 'zone-1',
    });
    expect(result).toEqual({
      ok: true,
      url: 'https://switchboardsocial.me/zones/join/join-code',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/zones');
  });
});
