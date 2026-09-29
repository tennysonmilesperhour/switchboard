import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  report: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks }));
vi.mock('@/lib/server/observability', () => ({ reportOperationalError: mocks.report }));

import { applyDecidedDate, winningSlot } from './poll-date';

type Result = { data?: unknown; error?: unknown };
type Query = { table: string; steps: Array<[string, ...unknown[]]> };
let queries: Query[];

/** Each result is consumed only when its query is awaited, as in PostgREST. */
function database(results: Result[]) {
  mocks.from.mockImplementation((table: string) => {
    const query: Query = { table, steps: [] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'update', 'maybeSingle']) {
      builder[method] = (...args: unknown[]) => {
        query.steps.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: Result) => void, reject: (error: Error) => void) => {
      const result = results.shift();
      return result
        ? Promise.resolve(result).then(resolve, reject)
        : Promise.reject(new Error(`Unexpected query: ${table}`)).then(resolve, reject);
    };
    return builder;
  });
}

const POLL = { event_id: 'event-1', phase: 'decided', winning_option_id: 'opt-1' };
const SLOT_OPTION = {
  poll_id: 'poll-1',
  label: '2026-10-02T17:00:00.000Z',
  detail: '2026-10-02T17:00:00+00:00',
};
const EVENT = {
  id: 'event-1',
  host_id: 'host-1',
  status: 'deciding',
  starts_at: null,
  ends_at: null,
  time_zone: 'America/New_York',
};

function updateOf(query: Query | undefined) {
  return query?.steps.find(([name]) => name === 'update')?.[1] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  queries = [];
});
afterEach(() => vi.useRealTimers());

describe('winningSlot', () => {
  it('reads the slot from the label, or from the detail once the label is reworded', () => {
    expect(winningSlot(SLOT_OPTION)).toBe('2026-10-02T17:00:00.000Z');
    expect(winningSlot({ label: 'Friday at Sam’s', detail: '2026-10-02T17:00:00+00:00' })).toBe(
      '2026-10-02T17:00:00.000Z',
    );
  });

  it('never finds a date in the group’s own words', () => {
    expect(winningSlot({ label: 'Saturday 3pm', detail: 'bring snacks' })).toBeNull();
    expect(winningSlot(null)).toBeNull();
  });
});

describe('applyDecidedDate', () => {
  it('sets a winning "Friday evening" to 6pm Friday in the plan’s zone', async () => {
    database([{ data: POLL }, { data: SLOT_OPTION }, { data: EVENT }, { data: [{ id: 'event-1' }] }]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({
      kind: 'set',
      startsAt: '2026-10-02T22:00:00.000Z',
      timeZone: 'America/New_York',
    });
    const write = queries.at(-1);
    expect(updateOf(write)).toEqual({
      starts_at: '2026-10-02T22:00:00.000Z',
      reminded_day_before_at: null,
      reminded_soon_at: null,
    });
    // Guarded on the status it was read in, so a plan cancelled meanwhile is
    // not given a date.
    expect(write?.steps).toContainEqual(['eq', 'status', 'deciding']);
  });

  it('pins the host’s zone on a plan that never recorded one', async () => {
    database([
      { data: POLL },
      { data: SLOT_OPTION },
      { data: { ...EVENT, time_zone: null } },
      { data: { timezone: 'Asia/Kolkata' } },
      { data: [{ id: 'event-1' }] },
    ]);
    await expect(applyDecidedDate('poll-1')).resolves.toMatchObject({
      kind: 'set',
      startsAt: '2026-10-02T12:30:00.000Z',
      timeZone: 'Asia/Kolkata',
    });
    expect(updateOf(queries.at(-1))).toMatchObject({ time_zone: 'Asia/Kolkata' });
  });

  it('clears an end that would now come before the start', async () => {
    database([
      { data: POLL },
      { data: SLOT_OPTION },
      { data: { ...EVENT, ends_at: '2026-10-01T02:00:00Z' } },
      { data: [{ id: 'event-1' }] },
    ]);
    await applyDecidedDate('poll-1');
    expect(updateOf(queries.at(-1))).toMatchObject({ ends_at: null });
  });

  it('leaves a free-text winner to the host', async () => {
    database([{ data: POLL }, { data: { poll_id: 'poll-1', label: 'The rooftop', detail: null } }]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'none' });
    expect(queries.map((query) => query.table)).toEqual(['polls', 'poll_options']);
  });

  it('does nothing for a poll decided without a winner', async () => {
    database([{ data: { ...POLL, winning_option_id: null } }]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'none' });
    expect(queries).toHaveLength(1);
  });

  it('refuses an option that belongs to another poll', async () => {
    database([{ data: POLL }, { data: { ...SLOT_OPTION, poll_id: 'poll-2' } }]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'none' });
  });

  it('does not date a plan for a time that has already started', async () => {
    vi.setSystemTime(new Date('2026-10-02T23:00:00Z'));
    database([{ data: POLL }, { data: SLOT_OPTION }, { data: EVENT }]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'past' });
    expect(queries.some((query) => updateOf(query))).toBe(false);
  });

  it('does not move the date of a plan whose invitations went out', async () => {
    database([
      { data: POLL },
      { data: SLOT_OPTION },
      { data: { ...EVENT, status: 'inviting', starts_at: '2026-10-05T23:00:00Z' } },
    ]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'kept' });
    expect(queries.some((query) => updateOf(query))).toBe(false);
  });

  it('fills a missing date past deciding only while it is still missing', async () => {
    database([
      { data: POLL },
      { data: SLOT_OPTION },
      { data: { ...EVENT, status: 'inviting' } },
      { data: [] },
    ]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'kept' });
    expect(queries.at(-1)?.steps).toContainEqual(['is', 'starts_at', null]);
  });

  it('is idempotent once the date is in place', async () => {
    database([
      { data: POLL },
      { data: SLOT_OPTION },
      { data: { ...EVENT, starts_at: '2026-10-02T22:00:00+00:00' } },
    ]);
    await expect(applyDecidedDate('poll-1')).resolves.toMatchObject({ kind: 'set' });
    expect(queries.some((query) => updateOf(query))).toBe(false);
  });

  it('ignores a plan that was called off', async () => {
    database([{ data: POLL }, { data: SLOT_OPTION }, { data: { ...EVENT, status: 'cancelled' } }]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'none' });
  });

  it('logs a failed write with its code and never throws', async () => {
    const failure = { message: 'Database unavailable', code: '08006' };
    database([{ data: POLL }, { data: SLOT_OPTION }, { data: EVENT }, { error: failure }]);
    await expect(applyDecidedDate('poll-1')).resolves.toEqual({ kind: 'failed' });
    expect(mocks.report).toHaveBeenCalledWith('poll.apply-date', failure, { pollId: 'poll-1' });
  });
});
