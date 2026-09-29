import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  geocodeDetailed: vi.fn(),
  searchPlacesDetailed: vi.fn(),
  update: vi.fn(),
  reportOperationalError: vi.fn(async () => undefined),
  from: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true) }));
vi.mock('@/lib/server/geocode', () => ({
  geocodeDetailed: mocks.geocodeDetailed,
  searchPlacesDetailed: mocks.searchPlacesDetailed,
}));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string, _area: string, _error: unknown, _ctx: unknown, message?: string) => ({
    ok: false,
    code,
    error: message ?? code,
  })),
  reportOperationalError: mocks.reportOperationalError,
}));

import { locateMyPlaces, searchPlaces } from './map';

const PLANS = [
  { id: 'p1', location_name: 'Liberty Park', location_address: null, starts_at: '2099-01-01T00:00:00Z' },
  { id: 'p2', location_name: 'Red Butte Garden', location_address: null, starts_at: '2099-01-02T00:00:00Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  const eventsQuery = {
    select: () => eventsQuery,
    eq: () => eventsQuery,
    is: () => eventsQuery,
    neq: async () => ({ data: PLANS, error: null }),
    update: (values: unknown) => {
      mocks.update(values);
      const node = { eq: () => node, then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) };
      return node;
    },
  };
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'events') throw new Error(`locate should only touch plans, not ${table}`);
    return eventsQuery;
  });
  mocks.requireUser.mockResolvedValue({ ok: true, user: { id: 'host' }, supabase: { from: mocks.from } });
});

describe('Locate my plans', () => {
  it('places the caller’s plans and never touches shared places', async () => {
    mocks.geocodeDetailed.mockResolvedValue({ status: 'found', point: { lat: 40.7, lng: -111.9 } });

    const result = await locateMyPlaces();

    expect(result).toMatchObject({ ok: true, located: 2, unmatched: 0, interrupted: false });
    expect(mocks.from).not.toHaveBeenCalledWith('moments');
  });

  it('reports an outage with SB-MAP-LOOKUP, not as addresses it couldn’t find', async () => {
    mocks.geocodeDetailed.mockResolvedValue({ status: 'unavailable' });

    const result = await locateMyPlaces();

    expect(result).toMatchObject({ ok: false, code: 'SB-MAP-LOOKUP' });
    expect(mocks.geocodeDetailed).toHaveBeenCalledTimes(1);
  });

  it('keeps what it placed when the service stops answering part-way', async () => {
    mocks.geocodeDetailed
      .mockResolvedValueOnce({ status: 'found', point: { lat: 40.7, lng: -111.9 } })
      .mockResolvedValueOnce({ status: 'unavailable' });

    const result = await locateMyPlaces();

    expect(result).toMatchObject({ ok: true, located: 1, unmatched: 0, interrupted: true });
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'map.locate',
      expect.any(Error),
      expect.anything(),
      'SB-MAP-LOOKUP',
    );
  });

  it('still counts a real miss as an address to fix', async () => {
    mocks.geocodeDetailed.mockResolvedValue({ status: 'none' });
    expect(await locateMyPlaces()).toMatchObject({ ok: true, located: 0, unmatched: 2 });
  });
});

describe('place search', () => {
  it('says the lookup is down instead of showing no matches', async () => {
    mocks.searchPlacesDetailed.mockResolvedValue(null);
    expect(await searchPlaces('Liberty Park')).toMatchObject({ ok: false, code: 'SB-MAP-LOOKUP' });
  });

  it('returns matches', async () => {
    mocks.searchPlacesDetailed.mockResolvedValue([]);
    expect(await searchPlaces('Liberty Park')).toEqual({ ok: true, results: [] });
  });
});
