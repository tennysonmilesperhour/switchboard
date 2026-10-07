import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { errorFor, type ErrorCode } from '@/lib/errors';

/**
 * Live location is the most sensitive data the app holds (docs/SECURITY.md,
 * "Live location"). These pin what the server actions promise on top of the
 * owner-only RLS and the coarsening trigger:
 *
 *   - an impossible coordinate never reaches the database;
 *   - a stored coordinate is already rounded to ~110 m, whatever the device sent;
 *   - every share expires within 15 minutes–8 hours, and moving never extends it;
 *   - every read and write is keyed to the session's own id;
 *   - the discovery radius is clamped before it reaches `find_nearby_people`,
 *     which is the only way to see anyone else.
 *
 * The real `requireUser` runs against a mocked session client, and the real
 * `reportAndFail` runs too, so each failure is checked against its registry
 * entry and against the log line written for it.
 */

type Result = { data?: unknown; error?: unknown };
type Call = { table: string; steps: Array<[string, ...unknown[]]> };

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  from: vi.fn(),
  rpc: vi.fn(),
  checkRateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import {
  getMySharing,
  getNearbyPeople,
  refreshLocationPoint,
  shareLocation,
  stopSharingLocation,
  type ShareLocationInput,
} from './live-location';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const HOUR_MS = 3_600_000;
/** A precise device fix: Lower Manhattan, to a metre or so. */
const FIX = { lat: 40.712776, lng: -74.005974 };

let calls: Call[];
let answers: Record<string, Result>;
let consoleError: MockInstance<typeof console.error>;

/** A session client whose every query on `table` answers with `answers[table]`. */
function from(table: string) {
  const call: Call = { table, steps: [] };
  calls.push(call);
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'upsert', 'update', 'delete', 'eq', 'gt']) {
    builder[method] = (...args: unknown[]) => {
      call.steps.push([method, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => {
    call.steps.push(['maybeSingle']);
    return answers[table] ?? { data: null, error: null };
  };
  builder.single = async () => {
    call.steps.push(['single']);
    return answers[table] ?? { data: null, error: null };
  };
  builder.then = (resolve: (value: Result) => unknown) =>
    Promise.resolve(answers[table] ?? { data: null, error: null }).then(resolve);
  return builder;
}

function stepsOf(table: string) {
  return calls.filter((call) => call.table === table).flatMap((call) => call.steps);
}

/** The arguments of the first `method` step written against `table`. */
function argsOf(table: string, method: string): unknown[] {
  const step = stepsOf(table).find(([name]) => name === method);
  if (!step) throw new Error(`No ${method} on ${table}`);
  return step.slice(1);
}

/** The exact failure the registry defines for `code`, optionally reworded. */
function expectFailure(result: unknown, code: ErrorCode, message?: string) {
  const entry = errorFor(code);
  expect(result).toEqual({ ok: false, code, error: message ?? entry.message, fix: entry.fix });
}

/** The structured log lines `reportOperationalError` wrote. */
function logged(): Array<{ area: string; userCode: string }> {
  return consoleError.mock.calls.map(([line]) => JSON.parse(String(line)));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  calls = [];
  answers = {};
  mocks.user = { id: 'user-1' };
  mocks.from.mockImplementation(from);
  mocks.rpc.mockImplementation(async (name: string) =>
    name === 'find_nearby_people' ? { data: [], error: null } : { data: null, error: null },
  );
  mocks.checkRateLimit.mockResolvedValue(true);
  vi.stubEnv('OBSERVABILITY_WEBHOOK_URL', '');
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** Coordinates that must never be stored, whatever path they arrive by. */
const IMPOSSIBLE: Array<[string, unknown, unknown]> = [
  ['latitude past the pole', 90.5, 0],
  ['latitude below the pole', -91, 10],
  ['longitude past the antimeridian', 10, 180.5],
  ['longitude below the antimeridian', 10, -181],
  ['NaN', Number.NaN, 10],
  ['infinity', 10, Number.POSITIVE_INFINITY],
  ['null island (a failed fix, not a place)', 0, 0],
  ['a numeric string', '40.7', -74],
  ['a missing coordinate', undefined, -74],
];

describe('shareLocation', () => {
  function share(overrides: Partial<ShareLocationInput> = {}) {
    return shareLocation({ ...FIX, ...overrides });
  }

  it('refuses a signed-out caller before spending a rate-limit slot or writing', async () => {
    mocks.user = null;

    const result = await share();

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(IMPOSSIBLE)('refuses %s before touching the database', async (_label, lat, lng) => {
    const result = await shareLocation({ lat, lng } as ShareLocationInput);

    expectFailure(result, 'SB-LOCATION-DENIED');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('is rate limited per user, and a limited update writes nothing', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await share();

    expectFailure(result, 'SB-RATE-LIMIT', 'Too many location updates. Try again in a moment.');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('live-share:user-1', 300, 3600);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses to start a share during a sabbatical, and writes nothing', async () => {
    answers.profiles = { data: { sabbatical: true }, error: null };

    const result = await share();

    expectFailure(result, 'SB-LOCATION-PAUSED');
    expect(stepsOf('live_locations')).toEqual([]);
  });

  it('stores only a coarsened point, on the caller’s own row, for two hours by default', async () => {
    const result = await share();

    const expiresAt = new Date(NOW.getTime() + 2 * HOUR_MS).toISOString();
    expect(result).toEqual({ ok: true, expiresAt });
    expect(argsOf('live_locations', 'upsert')).toEqual([
      {
        user_id: 'user-1',
        // Three decimal places (~110 m): the exact fix never leaves the server.
        latitude: 40.713,
        longitude: -74.006,
        accuracy_m: null,
        headline: null,
        emoji: null,
        visibility: 'sharers',
        updated_at: NOW.toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'user_id' },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/map');
  });

  it('writes the session’s id even when the caller posts someone else’s', async () => {
    await shareLocation({ ...FIX, user_id: 'someone-else' } as ShareLocationInput);

    const [row] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
    expect(row.user_id).toBe('user-1');
  });

  it.each([
    ['nothing chosen', undefined, 120],
    ['NaN', Number.NaN, 120],
    ['infinity', Number.POSITIVE_INFINITY, 120],
    ['thirty minutes', 30, 30],
    ['an hour', 60, 60],
    ['zero', 0, 15],
    ['a negative window', -5, 15],
    ['a minute', 1, 15],
    ['the maximum', 480, 480],
    ['a whole day', 1440, 480],
    ['a numeric string', '480', 120],
  ])('clamps the window for %s to %i min', async (_label, minutes, expected) => {
    const result = await share({ minutes: minutes as number });

    const expiresAt = new Date(NOW.getTime() + expected * 60_000).toISOString();
    expect(result).toEqual({ ok: true, expiresAt });
    const [row] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
    expect(row.expires_at).toBe(expiresAt);
  });

  it('keeps the running window when only the details change', async () => {
    const running = new Date(NOW.getTime() + 25 * 60_000).toISOString();
    answers.live_locations = { data: { expires_at: running }, error: null };

    const result = await share({ keepWindow: true, minutes: 480, visibility: 'connections' });

    expect(result).toEqual({ ok: true, expiresAt: running });
    const [row] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
    expect(row.expires_at).toBe(running);
  });

  it('starts a fresh window when keepWindow finds no live share', async () => {
    const result = await share({ keepWindow: true, minutes: 60 });

    const expiresAt = new Date(NOW.getTime() + HOUR_MS).toISOString();
    expect(result).toEqual({ ok: true, expiresAt });
  });

  it('keeps only a real accuracy reading', async () => {
    await share({ accuracyM: 12.5 });
    const [kept] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
    expect(kept.accuracy_m).toBe(12.5);

    for (const accuracyM of [-1, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      calls = [];
      await share({ accuracyM });
      const [row] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
      expect(row.accuracy_m).toBeNull();
    }
  });

  it('trims the headline and emoji to their limits, and stores blanks as nothing', async () => {
    await share({ headline: `  ${'h'.repeat(120)}  `, emoji: '  🎉🎉🎉🎉🎉  ' });
    const [long] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
    expect(long.headline).toBe('h'.repeat(90));
    expect(long.emoji).toBe('🎉🎉🎉🎉');

    calls = [];
    await share({ headline: '   ', emoji: '' });
    const [blank] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
    expect(blank.headline).toBeNull();
    expect(blank.emoji).toBeNull();
  });

  it.each([
    ['connections', 'connections'],
    ['sharers', 'sharers'],
    ['everyone', 'sharers'],
    [undefined, 'sharers'],
  ])('narrows visibility %s to %s', async (visibility, expected) => {
    await share({ visibility: visibility as ShareLocationInput['visibility'] });

    const [row] = argsOf('live_locations', 'upsert') as [Record<string, unknown>];
    expect(row.visibility).toBe(expected);
  });

  it('reports a failed write as SB-LOCATION-SAVE, on screen and in the log', async () => {
    answers.live_locations = { error: { code: 'XX000', message: 'boom' } };

    const result = await share();

    expectFailure(result, 'SB-LOCATION-SAVE');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'location.share', userCode: 'SB-LOCATION-SAVE' }),
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('refreshLocationPoint', () => {
  it('refuses a signed-out caller', async () => {
    mocks.user = null;

    const result = await refreshLocationPoint(FIX.lat, FIX.lng);

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(IMPOSSIBLE)('refuses %s before touching the database', async (_label, lat, lng) => {
    const result = await refreshLocationPoint(lat as number, lng as number);

    expectFailure(result, 'SB-LOCATION-DENIED', 'Invalid location.');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('draws on the same per-user bucket as sharing', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await refreshLocationPoint(FIX.lat, FIX.lng);

    expectFailure(result, 'SB-RATE-LIMIT', 'Too many location updates.');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('live-share:user-1', 300, 3600);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('moves the caller’s live pin, coarsened, without extending the share', async () => {
    answers.live_locations = { data: { user_id: 'user-1' }, error: null };

    const result = await refreshLocationPoint(FIX.lat, FIX.lng, 30);

    expect(result).toEqual({ ok: true });
    expect(stepsOf('live_locations')).toEqual([
      [
        'update',
        // No expires_at, visibility or headline: moving is not re-sharing.
        { latitude: 40.713, longitude: -74.006, accuracy_m: 30, updated_at: NOW.toISOString() },
      ],
      ['eq', 'user_id', 'user-1'],
      // Only a row that is still live, so a stopped or lapsed share stays off.
      ['gt', 'expires_at', NOW.toISOString()],
      ['select', 'user_id'],
      ['maybeSingle'],
    ]);
  });

  it('drops an unusable accuracy reading', async () => {
    answers.live_locations = { data: { user_id: 'user-1' }, error: null };

    await refreshLocationPoint(FIX.lat, FIX.lng, -3);

    const [values] = argsOf('live_locations', 'update') as [Record<string, unknown>];
    expect(values.accuracy_m).toBeNull();
  });

  it('answers not_sharing, with no code, when there is no live share to move', async () => {
    answers.live_locations = { data: null, error: null };

    const result = await refreshLocationPoint(FIX.lat, FIX.lng);

    // LiveShare.tsx matches this exact sentinel to end the share on screen.
    expect(result).toEqual({ ok: false, error: 'not_sharing' });
  });

  it('reports a failed update as SB-LOCATION-SAVE', async () => {
    answers.live_locations = { data: null, error: { code: 'XX000', message: 'boom' } };

    const result = await refreshLocationPoint(FIX.lat, FIX.lng);

    expectFailure(result, 'SB-LOCATION-SAVE');
    // Its own log area, so a failed move is not mistaken for a failed share.
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'location.refresh', userCode: 'SB-LOCATION-SAVE' }),
    ]);
  });
});

describe('stopSharingLocation', () => {
  it('refuses a signed-out caller', async () => {
    mocks.user = null;

    const result = await stopSharingLocation();

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('deletes the caller’s own row, so nobody can find them', async () => {
    const result = await stopSharingLocation();

    expect(result).toEqual({ ok: true });
    expect(stepsOf('live_locations')).toEqual([['delete'], ['eq', 'user_id', 'user-1']]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/map');
  });

  it('reports a failed delete as SB-LOCATION-SAVE', async () => {
    answers.live_locations = { error: { code: 'XX000', message: 'boom' } };

    const result = await stopSharingLocation();

    expectFailure(result, 'SB-LOCATION-SAVE');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'location.stop', userCode: 'SB-LOCATION-SAVE' }),
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('getMySharing', () => {
  it('is null for a signed-out caller, without a query', async () => {
    mocks.user = null;

    expect(await getMySharing()).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('reads only the caller’s own share, and only while it is live', async () => {
    const row = { user_id: 'user-1', latitude: 40.713, longitude: -74.006 };
    answers.live_locations = { data: row, error: null };

    expect(await getMySharing()).toEqual(row);
    expect(stepsOf('live_locations')).toEqual([
      [
        'select',
        'user_id, latitude, longitude, accuracy_m, headline, emoji, visibility, updated_at, expires_at',
      ],
      ['eq', 'user_id', 'user-1'],
      ['gt', 'expires_at', NOW.toISOString()],
      ['maybeSingle'],
    ]);
  });

  it('is null when the share lapsed or never started', async () => {
    expect(await getMySharing()).toBeNull();
  });
});

describe('getNearbyPeople', () => {
  it('refuses a signed-out caller before spending a slot or asking the database', async () => {
    mocks.user = null;

    const result = await getNearbyPeople();

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('is rate limited on its own bucket, separate from sharing', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await getNearbyPeople();

    expectFailure(result, 'SB-RATE-LIMIT', 'Too many refreshes. Try again in a moment.');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('live-nearby:user-1', 600, 3600);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['the default', undefined, 5_000],
    ['a sub-block radius', 50, 100],
    ['a negative radius', -1, 100],
    ['the minimum', 100, 100],
    ['a neighbourhood', 2_500, 2_500],
    ['the maximum', 50_000, 50_000],
    ['a nation-wide search', 1e9, 50_000],
    ['NaN', Number.NaN, 5_000],
    ['infinity', Number.POSITIVE_INFINITY, 5_000],
    ['a numeric string', '9e9', 5_000],
    ['null', null, 5_000],
  ])('clamps %s to %i m before it reaches the RPC', async (_label, radius, expected) => {
    await getNearbyPeople(radius as number);

    expect(mocks.rpc).toHaveBeenCalledWith('find_nearby_people', { p_radius_m: expected });
  });

  it('sees other people only through find_nearby_people, never the table', async () => {
    const people = [{ user_id: 'friend-1', distance_m: 420 }];
    mocks.rpc.mockImplementation(async () => ({ data: people, error: null }));

    const result = await getNearbyPeople(1_000);

    expect(result).toEqual({ ok: true, people });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('answers an empty list, not an error, when nobody is visible', async () => {
    mocks.rpc.mockImplementation(async () => ({ data: null, error: null }));

    expect(await getNearbyPeople()).toEqual({ ok: true, people: [] });
  });

  it('reports a failed lookup as SB-LOCATION-LOAD', async () => {
    mocks.rpc.mockImplementation(async () => ({
      data: null,
      error: { code: 'XX000', message: 'boom' },
    }));

    const result = await getNearbyPeople(2_000);

    expectFailure(result, 'SB-LOCATION-LOAD');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'location.load', userCode: 'SB-LOCATION-LOAD' }),
    ]);
  });
});
