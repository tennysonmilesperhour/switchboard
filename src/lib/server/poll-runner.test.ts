import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  notifyUsers: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));

import { resolvePoll, sweepDuePolls, sweepSuggestionDeadlines } from './poll-runner';

type Result = { data?: unknown; error?: unknown };
type Query = { table: string; steps: Array<[string, ...unknown[]]> };
let queries: Query[];

/** Each result is consumed only when its query is awaited, as in PostgREST. */
function database(results: Result[]) {
  mocks.from.mockImplementation((table: string) => {
    const query: Query = { table, steps: [] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'not', 'lt', 'delete', 'update', 'single']) {
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

const POLL = {
  id: 'poll-1', resolution: 'runoff', phase: 'voting',
  created_at: '2026-09-24T10:00:00.000Z',
  vote_deadline: '2026-09-25T10:00:00.000Z',
};
const OPTIONS = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const VOTES = [
  { option_id: 'a', voter_id: 'voter-1', weight: 2 },
  { option_id: 'b', voter_id: 'voter-1', weight: 1 },
  { option_id: 'd', voter_id: 'voter-1', weight: -1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T10:05:00.000Z'));
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  queries = [];
});
afterEach(() => vi.useRealTimers());

describe('poll resolution', () => {
  it('gives the runoff a fresh full voting window, then resolves using its new ballots', async () => {
    database([
      { data: POLL }, { data: OPTIONS }, { data: VOTES },
      {}, {}, {},
    ]);
    await resolvePoll('poll-1', { onlyIfDue: true });
    const nextDeadline = '2026-09-26T10:05:00.000Z';
    expect(queries[3].steps).toContainEqual(['in', 'id', ['d']]);
    expect(queries[4].table).toBe('poll_votes');
    expect(queries[5].steps).toContainEqual(['update', {
      phase: 'runoff', vote_deadline: nextDeadline, allow_suggestions: false,
    }]);
    expect(mocks.rpc).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-09-26T10:06:00.000Z'));
    database([
      { data: { ...POLL, phase: 'runoff', vote_deadline: nextDeadline } },
      { data: OPTIONS.slice(0, 3) },
      { data: [{ option_id: 'b', voter_id: 'voter-2', weight: 2 }] },
      {},
    ]);
    await resolvePoll('poll-1', { onlyIfDue: true });
    expect(queries.at(-1)?.steps).toContainEqual(['update', {
      phase: 'decided', winning_option_id: 'b',
    }]);
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_poll_children', { p_poll: 'poll-1' });
  });

  it('keeps a host-controlled poll untimed when it opens a runoff', async () => {
    database([
      { data: { ...POLL, vote_deadline: null } },
      { data: OPTIONS }, { data: VOTES }, {}, {}, {},
    ]);
    await resolvePoll('poll-1');
    expect(queries.at(-1)?.steps).toContainEqual(['update', {
      phase: 'runoff', vote_deadline: null, allow_suggestions: false,
    }]);
  });

  it('does not resolve a fresh runoff selected by an earlier cron snapshot', async () => {
    database([
      { data: [{ id: 'poll-1' }] },
      { data: { ...POLL, phase: 'runoff', vote_deadline: '2026-09-26T10:05:00.000Z' } },
    ]);
    await sweepDuePolls();
    expect(queries).toHaveLength(2);
    expect(queries.flatMap((query) => query.steps).some(([name]) => name === 'update')).toBe(false);
  });

  it.each(['options', 'votes'])('does not mistake an unreadable %s table for no votes', async (table) => {
    const failure = { message: 'Database unavailable', code: '08006' };
    database([
      { data: POLL },
      table === 'options' ? { error: failure } : { data: OPTIONS },
      table === 'votes' ? { error: failure } : { data: VOTES },
    ]);
    await expect(resolvePoll('poll-1')).rejects.toEqual(failure);
    expect(queries).toHaveLength(3);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reports a failed decision write without opening the next question', async () => {
    const failure = { message: 'Permission denied', code: '42501' };
    database([
      { data: { ...POLL, resolution: 'auto' } },
      { data: OPTIONS }, { data: VOTES }, { error: failure },
    ]);
    await expect(resolvePoll('poll-1')).rejects.toEqual(failure);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('retries opening follow-ups when the decision was saved before an unlock failed', async () => {
    database([{ data: { ...POLL, phase: 'decided' } }]);
    await resolvePoll('poll-1');
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_poll_children', { p_poll: 'poll-1' });
    expect(queries).toHaveLength(1);
  });

  it('surfaces a failed follow-up unlock to the caller', async () => {
    const failure = { message: 'RPC unavailable' };
    database([{ data: { ...POLL, phase: 'decided' } }]);
    mocks.rpc.mockResolvedValue({ data: null, error: failure });
    await expect(resolvePoll('poll-1')).rejects.toEqual(failure);
  });
});

describe('suggestion deadline', () => {
  it('disables guest suggestions as well as advancing the phase', async () => {
    database([{ data: [{ id: 'poll-1' }] }]);
    await expect(sweepSuggestionDeadlines()).resolves.toBe(1);
    expect(queries[0].steps).toContainEqual(['update', {
      phase: 'voting', allow_suggestions: false,
    }]);
    expect(queries[0].steps).toContainEqual(['eq', 'phase', 'suggesting']);
  });

  it('does not report a successful empty sweep when the database refused it', async () => {
    const failure = { message: 'Database unavailable' };
    database([{ error: failure }]);
    await expect(sweepSuggestionDeadlines()).rejects.toEqual(failure);
  });
});
