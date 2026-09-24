import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  zoneSelect: vi.fn(),
  zoneUpdate: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({ reportAndFail: vi.fn() }));

import { ensureZoneInviteLink, setZoneLocation, setZoneVisibility } from './zones';

function supabase() {
  return {
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table !== 'zones') throw new Error(`Unexpected table: ${table}`);
      return {
        update: (values: unknown) => {
          mocks.zoneUpdate(values);
          return { eq: () => ({ select: mocks.zoneSelect }) };
        },
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

  it('pins a zone and refreshes its page, the index, and the map', async () => {
    mocks.zoneSelect.mockResolvedValueOnce({ data: [{ slug: 'book-club' }], error: null });

    const result = await setZoneLocation('zone-1', { lat: 40.7, lng: -111.9 });

    expect(result).toEqual({ ok: true });
    expect(mocks.zoneUpdate).toHaveBeenCalledWith({ latitude: 40.7, longitude: -111.9 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/zones/book-club');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/map');
  });

  it('clears the pin when given no point', async () => {
    mocks.zoneSelect.mockResolvedValueOnce({ data: [{ slug: 'book-club' }], error: null });

    await setZoneLocation('zone-1', null);

    expect(mocks.zoneUpdate).toHaveBeenCalledWith({ latitude: null, longitude: null });
  });

  it('refuses a pin from someone who does not run the zone', async () => {
    const result = await setZoneLocation('zone-1', { lat: 40.7, lng: -111.9 });

    expect(result).toMatchObject({ ok: false, code: 'SB-ZONE-ACCESS' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects an impossible coordinate before touching the database', async () => {
    const result = await setZoneLocation('zone-1', { lat: 200, lng: 0 });

    expect(result.ok).toBe(false);
    expect(mocks.zoneUpdate).not.toHaveBeenCalled();
  });
});
