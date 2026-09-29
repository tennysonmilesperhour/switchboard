import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  zoneSelect: vi.fn(),
  zoneUpdate: vi.fn(),
  revalidatePath: vi.fn(),
  createAdminClient: vi.fn(),
  notifyUsers: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/server/observability', () => ({ reportAndFail: vi.fn() }));

import {
  ensureZoneInviteLink,
  removeZoneMember,
  requestToJoinZone,
  setZoneLocation,
  setZoneVisibility,
} from './zones';

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

describe('asking to join a private zone', () => {
  /** A query builder that resolves to `result` however it is chained. */
  function chain(result: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'then') {
            return (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
          }
          if (prop === 'maybeSingle') return async () => result;
          return () => builder;
        },
      },
    );
    return builder;
  }

  function arrange(insertError: { code: string } | null, visibility = 'private') {
    const insert = vi.fn(async () => ({ error: insertError }));
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'asker' },
      // The requester's own client: it can file a request, and nothing more.
      supabase: { from: () => ({ insert }) },
    });
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) =>
        chain(
          table === 'zones'
            ? {
                data: { name: 'Offsite', slug: 'offsite', organizer_id: 'organizer', visibility },
                error: null,
              }
            : { data: [{ member_id: 'moderator' }], error: null },
        ),
    });
    return { insert };
  }

  /**
   * The requester cannot read a private zone or its roster, so looking the
   * organizers up through their own client found nobody, every time.
   */
  it('tells the organizer and moderators, linking to the zone itself', async () => {
    arrange(null);

    const result = await requestToJoinZone('zone-1', ' please ');

    expect(result).toEqual({ ok: true });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['organizer', 'moderator'],
      expect.objectContaining({ kind: 'zone_join_request', url: '/zones/offsite' }),
    );
  });

  it('does not tell them again when the same person asks twice', async () => {
    arrange({ code: '23505' });

    const result = await requestToJoinZone('zone-1');

    expect(result).toEqual({ ok: true });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('tells nobody about a request to join a public zone', async () => {
    arrange(null, 'public');

    await requestToJoinZone('zone-1');

    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});

describe('removing someone from a zone', () => {
  it('does not call an RLS-refused removal a success', async () => {
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'member' },
      supabase: {
        from: () => ({
          delete: () => ({
            eq: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }),
          }),
        }),
      },
    });

    const result = await removeZoneMember('zone-1', 'someone-else');

    expect(result).toMatchObject({ ok: false, code: 'SB-ZONE-ACCESS' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
