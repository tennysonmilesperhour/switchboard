import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  notifyUsers: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => true),
}));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async () => ({
    ok: false,
    code: 'SB-MOMENT-SAVE',
    error: 'Could not verify this moment.',
    fix: 'Refresh Moments and try again.',
  })),
}));

import { acceptMoment, checkIn, expressCuriosity } from './moments';

function readBuilder(data: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return builder;
}

function arrangePair(blocked = true) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'find_shared_moments') {
      return { data: [{ id: 'moment-other' }], error: null };
    }
    if (name === 'is_blocked_with') return { data: blocked, error: null };
    return { data: null, error: null };
  });
  const supabase = {
    from: vi.fn(() => readBuilder({
      id: 'moment-mine',
      user_id: 'user-mine',
      place_name: 'Union Station',
    })),
    rpc,
  };
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'user-mine' },
    supabase,
  });
  mocks.adminFrom.mockImplementation((table: string) =>
    readBuilder(
      table === 'moments'
        ? { user_id: 'user-other', place_name: 'Union Station' }
        : null,
    ),
  );
  mocks.createAdminClient.mockReturnValue({ from: mocks.adminFrom });
  return { rpc };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Moments block recheck', () => {
  it.each([
    ['express curiosity', expressCuriosity],
    ['accept a moment', acceptMoment],
  ])('refuses to %s after either person blocks', async (_label, action) => {
    const { rpc } = arrangePair();

    const result = await action('moment-mine', 'moment-other');

    expect(result).toMatchObject({ ok: false, code: 'SB-MOMENT-ACCESS' });
    expect(rpc).toHaveBeenCalledWith('is_blocked_with', {
      p_other: 'user-other',
    });
    // Resolving the candidate for the check is allowed; no interest write and
    // no notification may happen after that check says the pair is blocked.
    expect(mocks.adminFrom).toHaveBeenCalledWith('moments');
    expect(mocks.adminFrom).not.toHaveBeenCalledWith('moment_interests');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('does not let an anonymous caller skip straight to acceptance', async () => {
    arrangePair(false);

    const result = await acceptMoment('moment-mine', 'moment-other');

    expect(result).toMatchObject({ ok: false, code: 'SB-MOMENT-ACCESS' });
    expect(mocks.adminFrom).toHaveBeenCalledWith('moment_interests');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});

describe('checkIn bounds', () => {
  function arrangeCheckIn() {
    const inserts: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn(() => ({
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return { error: null };
        },
      })),
    };
    mocks.requireUser.mockResolvedValue({ ok: true, user: { id: 'user-mine' }, supabase });
    return inserts;
  }

  /**
   * The screen offers 1-8 hours; a direct call could ask for a year and leave
   * an anonymous presence in everyone else's Moments long after leaving.
   */
  it('caps how long a check-in stays live', async () => {
    const inserts = arrangeCheckIn();
    const before = Date.now();
    await checkIn('Union Station', ['coffee'], '', 24 * 365);
    const until = Date.parse(String(inserts[0].available_until));
    expect(until - before).toBeLessThanOrEqual(8 * 3_600_000 + 5_000);
  });

  it('keeps at least an hour, and trims the free text', async () => {
    const inserts = arrangeCheckIn();
    const before = Date.now();
    await checkIn(`  ${'x'.repeat(300)}  `, ['coffee', '', 'y'.repeat(90)], 'h'.repeat(400), -5);
    const row = inserts[0];
    expect(Date.parse(String(row.available_until)) - before).toBeGreaterThanOrEqual(3_600_000 - 5_000);
    expect(String(row.place_name)).toHaveLength(120);
    expect(row.experiences).toEqual(['coffee', 'y'.repeat(40)]);
    expect(String(row.headline)).toHaveLength(140);
  });
});

describe('two accepts at the same moment', () => {
  /** Each `from(table)` call takes the next queued result for that table. */
  function queuedAdmin(queues: Record<string, unknown[]>) {
    const calls: string[] = [];
    return {
      calls,
      admin: {
        from(table: string) {
          calls.push(table);
          const result = { data: (queues[table] ?? []).shift() ?? null, error: null };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const builder: any = new Proxy(
            {},
            {
              get: (_target, prop) => {
                if (prop === 'then') {
                  return (resolve: (value: unknown) => unknown) =>
                    Promise.resolve(result).then(resolve);
                }
                if (prop === 'maybeSingle' || prop === 'single') return async () => result;
                return () => builder;
              },
            },
          );
          return builder;
        },
      },
    };
  }

  /**
   * Both people tapped "I'd love to share this moment" together: each call saw
   * the other's acceptance and each opened a room, so the pair got two rooms
   * and two sets of match notifications.
   */
  it('opens no second room when the other accept already claimed the match', async () => {
    arrangePair(false);
    const { admin, calls } = queuedAdmin({
      moments: [
        { user_id: 'user-other', place_name: 'Union Station' }, // candidate read
        [], // the claim: already matched by the other call
      ],
      moment_interests: [
        { id: 'interest-mine', stage: 'revealed' },
        null, // promote mine to accepted
        { stage: 'accepted' }, // theirs
      ],
    });
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await acceptMoment('moment-mine', 'moment-other');

    expect(result).toMatchObject({ ok: true, stage: 'matched' });
    expect(calls).not.toContain('rooms');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('opens the room when this accept claims the match', async () => {
    arrangePair(false);
    const { admin, calls } = queuedAdmin({
      moments: [
        { user_id: 'user-other', place_name: 'Union Station' },
        [{ id: 'moment-mine' }, { id: 'moment-other' }],
      ],
      moment_interests: [{ id: 'interest-mine', stage: 'revealed' }, null, { stage: 'accepted' }],
      rooms: [{ id: 'room-1' }],
    });
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await acceptMoment('moment-mine', 'moment-other');

    expect(result).toMatchObject({ ok: true, stage: 'matched', roomId: 'room-1' });
    expect(calls.filter((table) => table === 'rooms')).toHaveLength(1);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
  });
});
