import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { errorFor, type ErrorCode } from '@/lib/errors';

/**
 * Third-party introductions.
 *
 * Proposing: a friend may introduce two of their own connections, and nobody
 * else. The action checks that with `is_connected_with` on the caller's own
 * session (identity from `auth.uid()`, not an argument) before it writes, and
 * `matchmaker_proposer_insert` checks it again — along with the block rule
 * (`20260929170000_matchmaker_blocks.sql`): an intro can never pair two people
 * who have blocked each other. The fake insert below refuses exactly the way
 * that policy does, so these tests pin what the action does with the refusal:
 * tell nobody, and reveal nothing about why.
 *
 * Answering: `respond_to_matchmaker` decides whether the caller is a party and
 * closes an intro a block has overtaken. Only the call that makes the match
 * hears 'matched' (`20260930091000_matchmaker_match_once.sql`); later calls
 * hear 'already_matched'. The fake below follows the same order. The
 * service-role client is used only after the definer has accepted the caller.
 */

type Result = { data?: unknown; error?: unknown };
type Call = { client: 'session' | 'admin'; table: string; steps: Array<[string, ...unknown[]]> };

const mocks = vi.hoisted(() => ({
  user: { id: 'proposer' } as { id: string } | null,
  sessionFrom: vi.fn(),
  rpc: vi.fn(),
  adminFrom: vi.fn(),
  createAdminClient: vi.fn(),
  notifyUsers: vi.fn(),
  checkRateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    from: mocks.sessionFrom,
    rpc: mocks.rpc,
  }),
}));

import { proposeIntroduction, respondToIntroduction } from './matchmaker';

const RLS_REFUSAL = {
  code: '42501',
  message: 'new row violates row-level security policy for table "matchmaker_proposals"',
};

/** The world the fake database answers from. */
let db: {
  /** Who the proposer is connected to. */
  connections: Set<string>;
  /** Pairs with a block between them, either direction. */
  blocks: Array<[string, string]>;
  /** Who is on sabbatical. */
  resting: Set<string>;
  /** A failure for the sabbatical lookup. */
  restingError: unknown;
  /** A forced failure for the proposal insert, beyond the policy. */
  insertError: unknown;
  /** The intro's status, as `respond_to_matchmaker` reads it. */
  status: 'open' | 'matched' | 'closed';
  /** What an answer to an open, unblocked intro comes to. */
  outcome: 'open' | 'matched' | 'closed';
  /** What the service role reads back for the proposal. */
  proposal: Result;
};
let calls: Call[];
let consoleError: MockInstance<typeof console.error>;

function blocked(a: string, b: string) {
  return db.blocks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** A recording query builder that resolves through `answer` however it ends. */
function builder(kind: Call['client'], table: string, answer: (call: Call) => Result) {
  const call: Call = { client: kind, table, steps: [] };
  calls.push(call);
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'insert', 'eq', 'in']) {
    b[method] = (...args: unknown[]) => {
      call.steps.push([method, ...args]);
      return b;
    };
  }
  b.maybeSingle = async () => answer(call);
  b.then = (resolve: (value: Result) => unknown) => Promise.resolve(answer(call)).then(resolve);
  return b;
}

function sessionAnswer(call: Call): Result {
  if (call.table === 'profiles') {
    if (db.restingError) return { data: null, error: db.restingError };
    const ids = (call.steps.find(([m]) => m === 'in')?.[2] ?? []) as string[];
    return { data: ids.filter((id) => db.resting.has(id)).map((id) => ({ id })), error: null };
  }
  if (call.table === 'matchmaker_proposals') {
    if (db.insertError) return { data: null, error: db.insertError };
    const [, row] = call.steps.find(([m]) => m === 'insert') as [string, Record<string, string>];
    // matchmaker_proposer_insert, as amended by the block migration.
    const allowed =
      row.proposer_id === mocks.user?.id &&
      db.connections.has(row.person_a) &&
      db.connections.has(row.person_b) &&
      !blocked(row.person_a, row.person_b);
    return allowed ? { data: null, error: null } : { data: null, error: RLS_REFUSAL };
  }
  throw new Error(`Unexpected session table: ${call.table}`);
}

function adminAnswer(call: Call): Result {
  if (call.table === 'matchmaker_proposals') return db.proposal;
  throw new Error(`Unexpected admin table: ${call.table}`);
}

/** respond_to_matchmaker, in the order the migration checks things. */
function respond(): Result {
  const pair = db.proposal.data as { person_a: string; person_b: string } | null;
  if (!pair || ![pair.person_a, pair.person_b].includes(mocks.user?.id ?? '')) {
    return { data: null, error: { code: 'P0001', message: 'not your proposal' } };
  }
  if (db.status === 'matched') return { data: 'already_matched', error: null };
  if (db.status !== 'open') return { data: db.status, error: null };
  if (blocked(pair.person_a, pair.person_b)) {
    db.status = 'closed';
    return { data: 'closed', error: null };
  }
  db.status = db.outcome;
  return { data: db.outcome, error: null };
}

async function defaultRpc(name: string, args: Record<string, unknown>): Promise<Result> {
  if (name === 'is_connected_with') {
    return { data: db.connections.has(String(args.p_other)), error: null };
  }
  if (name === 'respond_to_matchmaker') return respond();
  throw new Error(`Unexpected rpc: ${name}`);
}

function stepsOf(kind: Call['client'], table: string) {
  return calls
    .filter((call) => call.client === kind && call.table === table)
    .flatMap((call) => call.steps);
}

/** The exact failure the registry defines for `code`, optionally reworded. */
function expectFailure(result: unknown, code: ErrorCode, message?: string, extra = {}) {
  const entry = errorFor(code);
  expect(result).toEqual({
    ok: false,
    code,
    error: message ?? entry.message,
    fix: entry.fix,
    ...extra,
  });
}

/** The structured log lines `reportOperationalError` wrote. */
function logged(): Array<{ area: string; userCode: string }> {
  return consoleError.mock.calls.map(([line]) => JSON.parse(String(line)));
}

beforeEach(() => {
  calls = [];
  db = {
    connections: new Set(['friend-a', 'friend-b', 'friend-c']),
    blocks: [],
    resting: new Set(),
    restingError: null,
    insertError: null,
    status: 'open',
    outcome: 'open',
    proposal: {
      data: { person_a: 'friend-a', person_b: 'friend-b', activity: 'Climbing', room_id: 'room-9' },
      error: null,
    },
  };
  mocks.user = { id: 'proposer' };
  mocks.sessionFrom.mockImplementation((table: string) => builder('session', table, sessionAnswer));
  mocks.adminFrom.mockImplementation((table: string) => builder('admin', table, adminAnswer));
  mocks.createAdminClient.mockImplementation(() => ({ from: mocks.adminFrom }));
  mocks.rpc.mockImplementation(defaultRpc);
  mocks.notifyUsers.mockResolvedValue({ recorded: true });
  mocks.checkRateLimit.mockResolvedValue(true);
  vi.stubEnv('OBSERVABILITY_WEBHOOK_URL', '');
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  mocks.rpc.mockImplementation(defaultRpc);
});

describe('proposeIntroduction', () => {
  it('refuses a signed-out caller before checking or writing anything', async () => {
    mocks.user = null;

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Climbing', '');

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('asks for two different people, with no code', async () => {
    const result = await proposeIntroduction('friend-a', 'friend-a', 'Climbing', '');

    expect(result).toEqual({ ok: false, error: 'Pick two different friends' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
  });

  it('asks what they would do together when the activity is blank, with no code', async () => {
    const result = await proposeIntroduction('friend-a', 'friend-b', '   ', 'note');

    expect(result).toEqual({ ok: false, error: 'What would they do together?' });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
  });

  it('is rate limited per proposer before any lookup', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Climbing', '');

    expectFailure(result, 'SB-RATE-LIMIT', 'You’ve sent a lot of intros. Try again later.');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('matchmaker:proposer', 20, 3600);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
  });

  it.each([
    ['the first person', 'stranger', 'friend-b'],
    ['the second person', 'friend-a', 'stranger'],
    ['either person', 'stranger', 'other-stranger'],
  ])('refuses when the proposer is not connected to %s', async (_label, personA, personB) => {
    const result = await proposeIntroduction(personA, personB, 'Climbing', '');

    expectFailure(result, 'SB-PERM-DENIED', 'You can only introduce people you’re connected to.');
    // Checked on the caller's own session: the RPC reads auth.uid(), so the
    // only thing the caller supplies is who they claim to know.
    expect(mocks.rpc).toHaveBeenCalledWith('is_connected_with', { p_other: personA });
    expect(mocks.rpc).toHaveBeenCalledWith('is_connected_with', { p_other: personB });
    // The endpoint cannot be used to push at arbitrary user ids (SB-08).
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('fails closed, as an outage and not "not connected", when the connection check errors', async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) =>
      name === 'is_connected_with' && args.p_other === 'friend-b'
        ? { data: null, error: { code: '57014', message: 'canceling statement due to timeout' } }
        : defaultRpc(name, args),
    );

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Climbing', '');

    expectFailure(result, 'SB-INTRO-SAVE');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'intro.create', userCode: 'SB-INTRO-SAVE' }),
    ]);
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('does not propose someone who is on sabbatical, and says so without a code', async () => {
    db.resting.add('friend-b');

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Climbing', '');

    expect(result).toEqual({ ok: false, error: 'One of them is on a sabbatical right now.' });
    expect(stepsOf('session', 'profiles')).toEqual([
      ['select', 'id'],
      ['in', 'id', ['friend-a', 'friend-b']],
      ['eq', 'sabbatical', true],
    ]);
    expect(stepsOf('session', 'matchmaker_proposals')).toEqual([]);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('fails closed when it cannot tell whether either of them is on sabbatical', async () => {
    db.restingError = { code: '57014', message: 'canceling statement due to timeout' };

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Climbing', '');

    expectFailure(result, 'SB-INTRO-SAVE');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'intro.create', userCode: 'SB-INTRO-SAVE' }),
    ]);
    expect(stepsOf('session', 'matchmaker_proposals')).toEqual([]);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('files the intro as the session user and tells both people without naming anyone', async () => {
    const result = await proposeIntroduction('friend-a', 'friend-b', '  Bouldering at Movement  ', '  You both love it  ');

    expect(result).toEqual({ ok: true });
    expect(stepsOf('session', 'matchmaker_proposals')).toEqual([
      [
        'insert',
        {
          proposer_id: 'proposer',
          person_a: 'friend-a',
          person_b: 'friend-b',
          activity: 'Bouldering at Movement',
          note: 'You both love it',
        },
      ],
    ]);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['friend-a', 'friend-b'], {
      kind: 'match',
      title: 'A friend thinks you two would hit it off',
      body: 'Someone you both know suggested bouldering at movement. Only revealed if you both say yes.',
      url: '/',
    });
    // Identities stay masked until both accept: the notice names nobody.
    const [[, payload]] = mocks.notifyUsers.mock.calls as [[string[], { title: string; body: string }]];
    expect(`${payload.title} ${payload.body}`).not.toMatch(/proposer|friend-a|friend-b/);
    // A proposal is written under RLS; the service role plays no part.
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/people');
  });

  it('caps the activity at 80 characters and the note at 280, and stores a blank note as null', async () => {
    await proposeIntroduction('friend-a', 'friend-b', 'a'.repeat(100), '   ');
    const [[, blank]] = stepsOf('session', 'matchmaker_proposals') as [[string, Record<string, unknown>]];
    expect(blank.activity).toBe('a'.repeat(80));
    expect(blank.note).toBeNull();

    calls = [];
    await proposeIntroduction('friend-a', 'friend-b', 'Coffee', 'n'.repeat(400));
    const [[, long]] = stepsOf('session', 'matchmaker_proposals') as [[string, Record<string, unknown>]];
    expect(long.note).toBe('n'.repeat(280));
  });

  it('never introduces two people who have blocked each other, and tells nobody', async () => {
    // The proposer knows both, and neither blocked the proposer — only each other.
    db.blocks.push(['friend-b', 'friend-a']);

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Dinner', '');

    // A refusal, not an outage: its own code, and advice that is not "try again".
    expectFailure(result, 'SB-INTRO-UNAVAILABLE');
    expect(errorFor('SB-INTRO-UNAVAILABLE').fix).not.toMatch(/again/i);
    // Neither person hears a thing: not the intro, and not that it was tried.
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    // And the proposer is not told there is a block, or by whom.
    expect(JSON.stringify(result)).not.toMatch(/block/i);
    expect(JSON.stringify(errorFor('SB-INTRO-UNAVAILABLE'))).not.toMatch(/block/i);
    // An expected refusal is not logged as an incident.
    expect(logged()).toEqual([]);
  });

  it('gives the same answer when a connection lapsed between the check and the insert', async () => {
    // The check passed a moment ago; the policy now sees the connection gone.
    db.insertError = RLS_REFUSAL;

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Dinner', '');

    expectFailure(result, 'SB-INTRO-UNAVAILABLE');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('still introduces either of them to someone they have not blocked', async () => {
    db.blocks.push(['friend-b', 'friend-a']);

    const result = await proposeIntroduction('friend-a', 'friend-c', 'Dinner', '');

    expect(result).toEqual({ ok: true });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['friend-a', 'friend-c'], expect.anything());
  });

  it('reports any other failed insert as SB-INTRO-SAVE and notifies nobody', async () => {
    db.insertError = { code: 'XX000', message: 'boom' };

    const result = await proposeIntroduction('friend-a', 'friend-b', 'Coffee', '');

    expectFailure(result, 'SB-INTRO-SAVE');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'intro.create', userCode: 'SB-INTRO-SAVE' }),
    ]);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});

describe('respondToIntroduction', () => {
  beforeEach(() => {
    mocks.user = { id: 'friend-a' };
  });

  it('refuses a signed-out caller before calling the database', async () => {
    mocks.user = null;

    const result = await respondToIntroduction('proposal-1', true);

    expectFailure(result, 'SB-AUTH-REQUIRED', undefined, { matched: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('records the answer through the definer on the caller’s session', async () => {
    await respondToIntroduction('proposal-1', false);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('respond_to_matchmaker', {
      p_proposal: 'proposal-1',
      p_accept: false,
    });
  });

  it('waits quietly for the other person after the first yes', async () => {
    const result = await respondToIntroduction('proposal-1', true);

    expect(result).toEqual({ ok: true, matched: false });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('opens nothing and tells nobody when a block has closed the intro', async () => {
    // The other person already said yes, so this yes would have matched them —
    // but one blocked the other after the intro went out.
    db.outcome = 'matched';
    db.blocks.push(['friend-b', 'friend-a']);

    const result = await respondToIntroduction('proposal-1', true);

    expect(result).toEqual({ ok: true, matched: false });
    // The two are never revealed to each other, so nothing reads the proposal
    // with the service role and nobody is told "it's a match".
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('refuses someone who is not a party before any service-role read', async () => {
    mocks.user = { id: 'stranger' };

    const result = await respondToIntroduction('proposal-1', true);

    expectFailure(result, 'SB-INTRO-SAVE', undefined, { matched: false });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'intro.respond', userCode: 'SB-INTRO-SAVE' }),
    ]);
  });

  it('tells both people about a match and sends them to the room it opened', async () => {
    db.outcome = 'matched';

    const result = await respondToIntroduction('proposal-1', true);

    expect(result).toEqual({ ok: true, matched: true, url: '/rooms/room-9' });
    // The service role reads only the proposal the definer just matched.
    expect(stepsOf('admin', 'matchmaker_proposals')).toEqual([
      ['select', 'person_a, person_b, activity, room_id'],
      ['eq', 'id', 'proposal-1'],
    ]);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['friend-a', 'friend-b'], {
      kind: 'match',
      title: 'It’s a match',
      body: 'You both said yes to climbing. Say hi!',
      url: '/rooms/room-9',
    });
  });

  it('announces a match once, however many times it is answered afterwards', async () => {
    db.outcome = 'matched';

    const first = await respondToIntroduction('proposal-1', true);
    // A double tap, a stale card, and the other person's late tap.
    const second = await respondToIntroduction('proposal-1', true);
    const late = await respondToIntroduction('proposal-1', false);
    mocks.user = { id: 'friend-b' };
    const other = await respondToIntroduction('proposal-1', true);

    expect(first).toEqual({ ok: true, matched: true, url: '/rooms/room-9' });
    for (const repeat of [second, late, other]) {
      // Still a success that lands in the room, just without a second fanfare.
      expect(repeat).toEqual({ ok: true, matched: true, url: '/rooms/room-9' });
    }
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
  });

  it('sends a repeat answer to Mutual when the match has no room', async () => {
    db.status = 'matched';
    db.proposal = {
      data: { person_a: 'friend-a', person_b: 'friend-b', activity: 'Climbing', room_id: null },
      error: null,
    };

    const result = await respondToIntroduction('proposal-1', true);

    expect(result).toEqual({ ok: true, matched: true, url: '/mutual' });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('falls back to Mutual, and a plain line, when the match has no room or activity', async () => {
    db.outcome = 'matched';
    db.proposal = {
      data: { person_a: 'friend-a', person_b: 'friend-b', activity: null, room_id: null },
      error: null,
    };

    const result = await respondToIntroduction('proposal-1', true);

    expect(result).toEqual({ ok: true, matched: true, url: '/mutual' });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['friend-a', 'friend-b'], {
      kind: 'match',
      title: 'It’s a match',
      body: 'You both said yes. Say hi!',
      url: '/mutual',
    });
  });

  it('still reports the match when the proposal cannot be read back', async () => {
    db.outcome = 'matched';
    // The definer still knows the pair; only the service-role read comes back empty.
    mocks.adminFrom.mockImplementation((table: string) =>
      builder('admin', table, () => ({ data: null, error: null })),
    );

    const result = await respondToIntroduction('proposal-1', true);

    expect(result).toEqual({ ok: true, matched: true });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});
