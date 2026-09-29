import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { errorFor, type ErrorCode } from '@/lib/errors';

/**
 * Clearing a match off Home, putting it back, and ending it.
 *
 * Dismiss and restore are one person's housekeeping: they write only the
 * caller's own `match_dismissals` row, keyed by the session id, never the
 * shared `matches` row. Unmatch goes through the `unmatch` definer, which
 * decides whether the caller is one of the two people; a stranger gets the same
 * answer as a match that has already gone.
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
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import { dismissMatch, restoreMatch, unmatch } from './matches';

let calls: Call[];
let answers: Record<string, Result>;
let consoleError: MockInstance<typeof console.error>;

/** A session client whose every query on `table` answers with `answers[table]`. */
function from(table: string) {
  const call: Call = { table, steps: [] };
  calls.push(call);
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'upsert', 'delete', 'eq']) {
    builder[method] = (...args: unknown[]) => {
      call.steps.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Result) => unknown) =>
    Promise.resolve(answers[table] ?? { data: null, error: null }).then(resolve);
  return builder;
}

function stepsOf(table: string) {
  return calls.filter((call) => call.table === table).flatMap((call) => call.steps);
}

/** The exact failure the registry defines for `code`. */
function expectFailure(result: unknown, code: ErrorCode) {
  const entry = errorFor(code);
  expect(result).toEqual({ ok: false, code, error: entry.message, fix: entry.fix });
}

/** The structured log lines `reportOperationalError` wrote. */
function logged(): Array<{ area: string; userCode: string }> {
  return consoleError.mock.calls.map(([line]) => JSON.parse(String(line)));
}

beforeEach(() => {
  calls = [];
  answers = {};
  mocks.user = { id: 'user-1' };
  mocks.from.mockImplementation(from);
  mocks.rpc.mockImplementation(async (name: string) =>
    name === 'unmatch' ? { data: 'unmatched', error: null } : { data: null, error: null },
  );
  vi.stubEnv('OBSERVABILITY_WEBHOOK_URL', '');
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('dismissMatch', () => {
  it('refuses a signed-out caller before writing anything', async () => {
    mocks.user = null;

    const result = await dismissMatch('match-1');

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('files the dismissal under the session’s own id, as a repeatable upsert', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-29T12:00:00.000Z') });

    const result = await dismissMatch('match-1');

    expect(result).toEqual({ ok: true });
    expect(stepsOf('match_dismissals')).toEqual([
      [
        'upsert',
        { match_id: 'match-1', user_id: 'user-1', dismissed_at: '2026-09-29T12:00:00.000Z' },
        // Two taps (or a retry) end in the same place, not a duplicate-key error.
        { onConflict: 'match_id,user_id' },
      ],
    ]);
    // The shared match row is never touched from here.
    expect(calls.map((call) => call.table)).toEqual(['match_dismissals']);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('reports a failed write as SB-MATCH-CLEAR, on screen and in the log', async () => {
    answers.match_dismissals = { error: { code: 'XX000', message: 'boom' } };

    const result = await dismissMatch('match-1');

    expectFailure(result, 'SB-MATCH-CLEAR');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'match.dismiss', userCode: 'SB-MATCH-CLEAR' }),
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('restoreMatch', () => {
  it('refuses a signed-out caller before deleting anything', async () => {
    mocks.user = null;

    const result = await restoreMatch('match-1');

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('deletes only the caller’s own dismissal of that match', async () => {
    const result = await restoreMatch('match-1');

    expect(result).toEqual({ ok: true });
    // The user_id filter is stated in the query itself, so a looser policy can
    // never widen this into clearing the other person's dismissal too.
    expect(stepsOf('match_dismissals')).toEqual([
      ['delete'],
      ['eq', 'match_id', 'match-1'],
      ['eq', 'user_id', 'user-1'],
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('reports a failed delete as SB-MATCH-CLEAR under its own log area', async () => {
    answers.match_dismissals = { error: { code: 'XX000', message: 'boom' } };

    const result = await restoreMatch('match-1');

    expectFailure(result, 'SB-MATCH-CLEAR');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'match.restore', userCode: 'SB-MATCH-CLEAR' }),
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('unmatch', () => {
  it('refuses a signed-out caller before calling the database', async () => {
    mocks.user = null;

    const result = await unmatch('match-1');

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('ends the match through the definer and refreshes Mutual, Rooms and Home', async () => {
    const result = await unmatch('match-1');

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('unmatch', { p_match: 'match-1' });
    // The caller cannot delete the shared row, the other person's intent or the
    // room under RLS; the action never tries to.
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path).sort()).toEqual([
      '/',
      '/mutual',
      '/rooms',
    ]);
  });

  it('gives someone outside the match the same answer as a match that is gone', async () => {
    // `unmatch` returns 'not_found' both for a vanished match and for a caller
    // who is not one of its two people, so the answer is no oracle.
    mocks.rpc.mockImplementation(async () => ({ data: 'not_found', error: null }));

    const result = await unmatch('someone-elses-match');

    expect(result).toEqual({ ok: false, error: 'That match is already gone.' });
    // Validation: the sentence is the whole story, so no code.
    expect(result).not.toHaveProperty('code');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('reports a database failure as SB-MUTUAL-SAVE', async () => {
    mocks.rpc.mockImplementation(async () => ({
      data: null,
      error: { code: '42501', message: 'sign in first' },
    }));

    const result = await unmatch('match-1');

    expectFailure(result, 'SB-MUTUAL-SAVE');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'mutual.unmatch', userCode: 'SB-MUTUAL-SAVE' }),
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
