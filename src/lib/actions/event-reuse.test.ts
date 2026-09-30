import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Run it back and Schedule the next one, from the action a host's button calls
 * down to the rows written. Only the database, Next and the senders are faked:
 * `requireUser`, `checkEventManager`, `cloneEventForReuse`, the recurrence math
 * and `reportAndFail` all run for real, so these tests prove what the host
 * actually gets — who may clone, that a failed write says `SB-PLAN-CLONE` with
 * the same code in the log and leaves nothing half-made (G27), that co-hosts
 * carry over only where the D1 policy lets them, that an undated clone asks for
 * a date (D19) and a dated one sends invitations, and that success lands on the
 * new plan.
 */

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string };

const HOST = '00000000-0000-0000-0000-00000000000h';
const COHOST = '00000000-0000-0000-0000-00000000000c';
const STRANGER = '00000000-0000-0000-0000-00000000000s';
const SOURCE_ID = 'source-plan';

const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  /** Who `is_event_host` says manages the source (host and co-hosts). */
  managers: [] as string[],
  source: null as Record<string, unknown> | null,
  prior: [] as Array<Record<string, unknown>>,
  questions: [] as Array<Record<string, unknown>>,
  cohosts: [] as Array<Record<string, unknown>>,
  sessionCohostInserts: [] as Array<Record<string, unknown>>,
  adminInserts: [] as Array<{ table: string; rows: unknown }>,
  adminUpserts: [] as Array<{ table: string; rows: unknown }>,
  adminDeletes: [] as Array<{ table: string; id: unknown }>,
  managerChecks: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  sessionFrom: vi.fn(),
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  }),
  revalidatePath: vi.fn(),
  advanceEventCascade: vi.fn(async (...args: unknown[]) => void args),
  openDecidingPlan: vi.fn(async (...args: unknown[]) => void args),
  notifyUsers: vi.fn(async (...args: unknown[]) => ({ recorded: true, args })),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.sessionFrom,
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.adminFrom, rpc: mocks.adminRpc }),
}));
vi.mock('@/lib/server/cascade-runner', () => ({ advanceEventCascade: mocks.advanceEventCascade }));
vi.mock('@/lib/server/poll-notices', () => ({ openDecidingPlan: mocks.openDecidingPlan }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));

import { runItBack, scheduleNextOccurrence } from './event-reuse';

/** A PostgREST-shaped builder that resolves to `result` however it is awaited. */
function builder(result: { data?: unknown; error?: DbError | null }) {
  const settled = { data: result.data ?? null, error: result.error ?? null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: async () => settled,
    single: async () => settled,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(settled).then(resolve, reject),
  };
  return chain;
}

// ---- Default table and RPC behaviour, keyed by name; restored after each test.

function defaultSessionFrom(table: string) {
  switch (table) {
    case 'events':
      return builder({ data: state.source });
    case 'invites':
      return builder({ data: state.prior });
    case 'event_questions':
      return builder({ data: state.questions });
    case 'event_cohosts': {
      const chain = builder({ data: state.cohosts });
      chain.insert = async (row: Row) => {
        state.sessionCohostInserts.push(row);
        return { error: null };
      };
      return chain;
    }
    default:
      throw new Error(`unexpected session table ${table}`);
  }
}

function defaultAdminFrom(table: string) {
  return {
    insert(rows: unknown) {
      state.adminInserts.push({ table, rows });
      const data = table === 'rooms' ? { id: 'room-new' } : table === 'events' ? { id: 'clone-1' } : null;
      return builder({ data });
    },
    upsert(rows: unknown) {
      state.adminUpserts.push({ table, rows });
      return builder({});
    },
    delete() {
      return {
        eq: async (_column: string, id: unknown) => {
          state.adminDeletes.push({ table, id });
          return { error: null };
        },
      };
    },
  };
}

async function defaultAdminRpc(name: string, args: Row) {
  if (name !== 'is_event_host') throw new Error(`unexpected rpc ${name}`);
  state.managerChecks.push(args);
  return { data: state.managers.includes(String(args.p_user)), error: null };
}

/** Make one admin table's insert fail, leaving every other table as it was. */
function failAdminInsert(table: string, error: DbError = { code: '08006', message: 'connection lost' }) {
  mocks.adminFrom.mockImplementation((name: string) => {
    const base = defaultAdminFrom(name);
    if (name !== table) return base;
    return {
      ...base,
      insert(rows: unknown) {
        state.adminInserts.push({ table: name, rows });
        return builder({ error });
      },
    };
  });
}

/** Make one session read fail, leaving every other table as it was. */
function failSessionRead(table: string, error: DbError = { code: '57014', message: 'statement timeout' }) {
  mocks.sessionFrom.mockImplementation((name: string) =>
    name === table ? builder({ error }) : defaultSessionFrom(name),
  );
}

const logged = () =>
  vi
    .mocked(console.error)
    .mock.calls.map(([line]) => JSON.parse(String(line)) as { area: string; userCode: string; context: Row });

function insertsInto(table: string) {
  return state.adminInserts.filter((entry) => entry.table === table).map((entry) => entry.rows);
}

/** Run an action that should succeed; return the URL it redirected to. */
async function landsOn(action: Promise<unknown>): Promise<string> {
  await expect(action).rejects.toThrow('NEXT_REDIRECT');
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
  return mocks.redirect.mock.calls[0][0];
}

const PAST_PLAN: Row = {
  id: SOURCE_ID,
  host_id: HOST,
  title: 'Taco night',
  description: 'Bring salsa',
  location_name: 'Casa Azul',
  status: 'past',
  starts_at: '2026-09-10T01:00:00.000Z',
  time_zone: 'America/Los_Angeles',
  invite_mode: 'cascade',
  show_invite_list: true,
  show_accepted: false,
  parental_approval: true,
  reminders_enabled: false,
  recurrence: 'none',
  recurrence_interval_days: null,
  share_token: 'old-share-token',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubEnv('OBSERVABILITY_WEBHOOK_URL', '');
  mocks.getUser.mockImplementation(async () => ({ data: { user: state.user } }));
  mocks.sessionFrom.mockImplementation(defaultSessionFrom);
  mocks.adminFrom.mockImplementation(defaultAdminFrom);
  mocks.adminRpc.mockImplementation(defaultAdminRpc);

  state.user = { id: HOST };
  state.managers = [HOST, COHOST];
  state.source = { ...PAST_PLAN };
  state.prior = [
    { invitee_id: 'guest-1', guest_name: null, guest_contact: null, position: 0, group_stage: 0, window_minutes: 60, decline_note: null, status: 'accepted' },
    { invitee_id: 'guest-2', guest_name: null, guest_contact: null, position: 1, group_stage: 0, window_minutes: 60, decline_note: 'not_my_thing', status: 'declined' },
    { invitee_id: 'requester', guest_name: null, guest_contact: null, position: 2, group_stage: 1, window_minutes: 60, decline_note: null, status: 'requested' },
    { invitee_id: HOST, guest_name: null, guest_contact: null, position: 3, group_stage: 1, window_minutes: 60, decline_note: null, status: 'accepted' },
    { invitee_id: 'guest-1', guest_name: null, guest_contact: null, position: 4, group_stage: 1, window_minutes: 60, decline_note: null, status: 'sent' },
    { invitee_id: null, guest_name: 'Sam', guest_contact: 'sam@example.com', position: 5, group_stage: 1, window_minutes: 30, decline_note: null, status: 'accepted' },
    { invitee_id: 'guest-3', guest_name: null, guest_contact: null, position: 6, group_stage: 2, window_minutes: 90, decline_note: 'busy', status: 'declined' },
  ];
  state.questions = [{ prompt: 'Spice level?', required: false, position: 0, kind: 'text', options: [] }];
  state.cohosts = [];
  state.sessionCohostInserts = [];
  state.adminInserts = [];
  state.adminUpserts = [];
  state.adminDeletes = [];
  state.managerChecks = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mocks.getUser.mockReset();
  mocks.sessionFrom.mockReset();
  mocks.adminFrom.mockReset();
  mocks.adminRpc.mockReset();
  mocks.redirect.mockClear();
  mocks.revalidatePath.mockClear();
  mocks.advanceEventCascade.mockReset();
  mocks.openDecidingPlan.mockReset();
  mocks.notifyUsers.mockClear();
});

describe('who may run a plan back', () => {
  it('asks a signed-out caller to sign in, and touches nothing', async () => {
    state.user = null;

    await expect(runItBack(SOURCE_ID)).resolves.toMatchObject({ ok: false, code: 'SB-AUTH-REQUIRED' });
    await expect(scheduleNextOccurrence(SOURCE_ID)).resolves.toMatchObject({ ok: false, code: 'SB-AUTH-REQUIRED' });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(state.adminInserts).toEqual([]);
  });

  it('refuses a session a moderator has since suspended', async () => {
    state.user = { id: HOST, banned_until: '2027-01-01T00:00:00.000Z' };

    await expect(runItBack(SOURCE_ID)).resolves.toMatchObject({ ok: false, code: 'SB-AUTH-SUSPENDED' });
    expect(state.adminInserts).toEqual([]);
  });

  it('refuses someone who does not manage the plan, checking the session’s own id', async () => {
    state.user = { id: STRANGER };

    await expect(runItBack(SOURCE_ID)).resolves.toMatchObject({ ok: false, code: 'SB-PERM-HOST' });
    await expect(scheduleNextOccurrence(SOURCE_ID)).resolves.toMatchObject({
      ok: false,
      code: 'SB-PERM-HOST',
      error: 'Only the host can schedule the next one.',
    });
    expect(state.managerChecks).toEqual([
      { p_event: SOURCE_ID, p_user: STRANGER },
      { p_event: SOURCE_ID, p_user: STRANGER },
    ]);
    expect(state.adminInserts).toEqual([]);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('refuses a co-host: starting the next one is the primary host’s', async () => {
    state.user = { id: COHOST };

    const runBack = await runItBack(SOURCE_ID);
    const next = await scheduleNextOccurrence(SOURCE_ID);

    expect(runBack).toMatchObject({ ok: false, code: 'SB-PERM-HOST', error: 'Only the plan’s main host can run it back.' });
    expect(next).toMatchObject({ ok: false, code: 'SB-PERM-HOST', error: 'Only the plan’s main host can schedule the next one.' });
    expect(state.adminInserts).toEqual([]);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('says it could not check, rather than “not the host”, when the manager check fails', async () => {
    mocks.adminRpc.mockImplementation(async () => ({ data: null, error: { code: '42883', message: 'no execute grant' } }));

    const runBack = await runItBack(SOURCE_ID);
    const next = await scheduleNextOccurrence(SOURCE_ID);

    expect(runBack).toMatchObject({ ok: false, code: 'SB-PLAN-AUTHZ' });
    expect(next).toMatchObject({ ok: false, code: 'SB-PLAN-AUTHZ' });
    expect(logged().map((line) => [line.area, line.userCode])).toEqual([
      ['authz.event-manager', 'SB-PLAN-AUTHZ'],
      ['authz.event-manager', 'SB-PLAN-AUTHZ'],
    ]);
    expect(state.adminInserts).toEqual([]);
  });
});

describe('runItBack', () => {
  it('opens the clone as a date poll for the crew and lands the host on it (D19)', async () => {
    const url = await landsOn(runItBack(SOURCE_ID));

    expect(url).toBe('/events/clone-1');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/plans');
    expect(insertsInto('rooms')).toEqual([{ kind: 'event', title: 'Taco night', created_by: HOST }]);
    const [event] = insertsInto('events') as Row[];
    expect(event).toMatchObject({
      host_id: HOST,
      status: 'deciding',
      starts_at: null,
      room_id: 'room-new',
      time_zone: 'America/Los_Angeles',
      // The rules the crew said yes under come with them.
      parental_approval: true,
      reminders_enabled: false,
      show_invite_list: true,
      show_accepted: false,
    });
    expect(event).not.toHaveProperty('share_token');
    expect(insertsInto('room_members')).toEqual([{ room_id: 'room-new', member_id: HOST }]);
    expect(insertsInto('polls')).toEqual([
      { event_id: 'clone-1', topic: 'date', phase: 'suggesting', resolution: 'host_pick' },
    ]);
    expect(mocks.openDecidingPlan).toHaveBeenCalledWith(expect.anything(), 'clone-1', HOST, []);
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
    expect(state.adminDeletes).toEqual([]);
  });

  it('carries the crew minus “not my thing”, requests, the host and repeats — renumbered, with no answers copied', async () => {
    await landsOn(runItBack(SOURCE_ID));

    const [rows] = insertsInto('invites') as Row[][];
    expect(rows.map((row) => row.invitee_id ?? row.guest_name)).toEqual(['guest-1', 'Sam', 'guest-3']);
    expect(rows.map((row) => row.position)).toEqual([0, 1, 2]);
    expect(rows[1]).toMatchObject({ guest_contact: 'sam@example.com', group_stage: 1, window_minutes: 30 });
    // A host may enqueue, never RSVP for someone: last time's yes is not this time's.
    for (const row of rows) {
      expect(row).not.toHaveProperty('status');
      expect(row).not.toHaveProperty('decline_note');
    }
    expect(insertsInto('event_questions')).toEqual([
      [{ prompt: 'Spice level?', required: false, position: 0, kind: 'text', options: [], event_id: 'clone-1' }],
    ]);
  });

  it('asks for a date even when the source was dated and repeats', async () => {
    state.source = { ...PAST_PLAN, recurrence: 'weekly' };

    await landsOn(runItBack(SOURCE_ID));

    expect(insertsInto('events')[0]).toMatchObject({ status: 'deciding', starts_at: null, recurrence: 'weekly' });
    expect(insertsInto('polls')).toHaveLength(1);
  });

  it('reports a failed source read with its code and writes nothing', async () => {
    failSessionRead('events');

    const result = await runItBack(SOURCE_ID);

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE', fix: 'Nothing was sent. Try again in a moment.' });
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'event.clone', userCode: 'SB-PLAN-CLONE', context: { sourceId: SOURCE_ID, step: 'source' } }),
    ]);
    expect(state.adminInserts).toEqual([]);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(['invites', 'event_questions', 'event_cohosts'])(
    'reports a failed %s carry-over read before anything is written',
    async (table) => {
      failSessionRead(table);

      const result = await runItBack(SOURCE_ID);

      expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE' });
      expect(logged()[0]).toMatchObject({ area: 'event.clone', userCode: 'SB-PLAN-CLONE', context: { step: 'carry-over' } });
      expect(state.adminInserts).toEqual([]);
    },
  );

  // Every write, in the order the clone makes them, and what must be removed.
  it.each([
    { table: 'rooms', step: 'room', removed: [] },
    { table: 'events', step: 'event', removed: [{ table: 'rooms', id: 'room-new' }] },
    { table: 'room_members', step: 'room-member', removed: [{ table: 'events', id: 'clone-1' }, { table: 'rooms', id: 'room-new' }] },
    { table: 'polls', step: 'poll', removed: [{ table: 'events', id: 'clone-1' }, { table: 'rooms', id: 'room-new' }] },
    { table: 'invites', step: 'invites', removed: [{ table: 'events', id: 'clone-1' }, { table: 'rooms', id: 'room-new' }] },
    { table: 'event_questions', step: 'questions', removed: [{ table: 'events', id: 'clone-1' }, { table: 'rooms', id: 'room-new' }] },
  ])('a failed $table write returns SB-PLAN-CLONE, logs the same code, and removes the half-made plan', async ({ table, step, removed }) => {
    state.cohosts = [{ cohost_id: COHOST }];
    failAdminInsert(table);

    const result = await runItBack(SOURCE_ID);

    expect(result).toEqual({
      ok: false,
      code: 'SB-PLAN-CLONE',
      error: 'Switchboard couldn’t set up the new plan.',
      fix: 'Nothing was sent. Try again in a moment.',
    });
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'event.clone', userCode: 'SB-PLAN-CLONE', context: { sourceId: SOURCE_ID, step } }),
    ]);
    expect(state.adminDeletes).toEqual(removed);
    // Nobody hears about a plan that no longer exists.
    expect(mocks.openDecidingPlan).not.toHaveBeenCalled();
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
    expect(state.sessionCohostInserts).toEqual([]);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('still returns the clone failure when removing the half-made plan also fails, and logs both', async () => {
    mocks.adminFrom.mockImplementation((name: string) => {
      const base = defaultAdminFrom(name);
      if (name === 'invites') return { ...base, insert: () => builder({ error: { message: 'boom' } }) };
      if (name === 'events') {
        return { ...base, delete: () => ({ eq: async () => ({ error: { message: 'delete refused' } }) }) };
      }
      return base;
    });

    const result = await runItBack(SOURCE_ID);

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE' });
    expect(logged().map((line) => line.context.step)).toEqual(['discard', 'invites']);
    expect(logged().every((line) => line.userCode === 'SB-PLAN-CLONE')).toBe(true);
    expect(state.adminDeletes).toEqual([{ table: 'rooms', id: 'room-new' }]);
  });

  it('carries co-hosts through the host’s own session, so the D1 policy decides who comes', async () => {
    state.cohosts = [{ cohost_id: COHOST }, { cohost_id: 'since-blocked' }, { cohost_id: 'flaky' }];
    mocks.sessionFrom.mockImplementation((name: string) => {
      const base = defaultSessionFrom(name);
      if (name !== 'event_cohosts') return base;
      base.insert = async (row: Row) => {
        state.sessionCohostInserts.push(row);
        if (row.cohost_id === 'since-blocked') return { error: { code: '42501', message: 'new row violates row-level security policy' } };
        if (row.cohost_id === 'flaky') return { error: { code: '08006', message: 'connection lost' } };
        return { error: null };
      };
      return base;
    });

    const url = await landsOn(runItBack(SOURCE_ID));

    expect(url).toBe('/events/clone-1');
    expect(state.sessionCohostInserts).toEqual([
      { event_id: 'clone-1', cohost_id: COHOST, added_by: HOST },
      { event_id: 'clone-1', cohost_id: 'since-blocked', added_by: HOST },
      { event_id: 'clone-1', cohost_id: 'flaky', added_by: HOST },
    ]);
    // Never written with the service role, which would skip the policy.
    expect(insertsInto('event_cohosts')).toEqual([]);
    // Only the one the policy let through joins the room and is told.
    expect(state.adminUpserts).toEqual([{ table: 'room_members', rows: [{ room_id: 'room-new', member_id: COHOST }] }]);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      [COHOST],
      expect.objectContaining({ kind: 'cohost_added', url: '/events/clone-1' }),
    );
    // A policy refusal is the rule working; a real failure is logged with its code.
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'event.clone', userCode: 'SB-PLAN-CLONE', context: { eventId: 'clone-1', step: 'cohosts' } }),
    ]);
    expect(state.adminDeletes).toEqual([]);
  });

  it('keeps the plan when the co-hosts’ room membership fails, and logs it', async () => {
    state.cohosts = [{ cohost_id: COHOST }];
    mocks.adminFrom.mockImplementation((name: string) => {
      const base = defaultAdminFrom(name);
      return name === 'room_members' ? { ...base, upsert: () => builder({ error: { message: 'boom' } }) } : base;
    });

    await landsOn(runItBack(SOURCE_ID));

    expect(logged().map((line) => line.context)).toEqual([{ eventId: 'clone-1', step: 'cohost-room' }]);
    expect(state.adminDeletes).toEqual([]);
  });

  it('still lands on the new plan when getting word out fails, and logs it', async () => {
    mocks.openDecidingPlan.mockRejectedValue(new Error('push provider down'));

    const url = await landsOn(runItBack(SOURCE_ID));

    expect(url).toBe('/events/clone-1');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'event-initial-delivery', context: { eventId: 'clone-1' } }),
    ]);
    expect(state.adminDeletes).toEqual([]);
  });
});

describe('scheduleNextOccurrence', () => {
  it('sends a weekly plan’s next date straight out as invitations', async () => {
    state.source = { ...PAST_PLAN, recurrence: 'weekly' };

    const url = await landsOn(scheduleNextOccurrence(SOURCE_ID));

    expect(url).toBe('/events/clone-1');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/plans');
    // 09-17 and 09-24 have passed by 09-30; the upcoming slot is 10-01.
    expect(insertsInto('events')[0]).toMatchObject({
      status: 'inviting',
      starts_at: '2026-10-01T01:00:00.000Z',
      recurrence: 'weekly',
    });
    expect(insertsInto('polls')).toEqual([]);
    expect(mocks.advanceEventCascade).toHaveBeenCalledWith('clone-1');
    expect(mocks.openDecidingPlan).not.toHaveBeenCalled();
  });

  it.each([
    { recurrence: 'custom', interval: 10, starts: '2026-09-01T18:00:00.000Z', next: '2026-10-01T18:00:00.000Z' },
    { recurrence: 'monthly', interval: null, starts: '2026-08-15T17:00:00.000Z', next: '2026-10-15T17:00:00.000Z' },
    { recurrence: 'biweekly', interval: null, starts: '2026-10-02T02:00:00.000Z', next: '2026-10-16T02:00:00.000Z' },
  ])('counts a $recurrence cadence forward to the first date after now', async ({ recurrence, interval, starts, next }) => {
    state.source = { ...PAST_PLAN, recurrence, recurrence_interval_days: interval, starts_at: starts };

    await landsOn(scheduleNextOccurrence(SOURCE_ID));

    expect(insertsInto('events')[0]).toMatchObject({ status: 'inviting', starts_at: next });
  });

  it.each([
    { why: 'does not repeat', patch: { recurrence: 'none' } },
    { why: 'has no start time to count from', patch: { recurrence: 'weekly', starts_at: null } },
    { why: 'has an unusable custom interval', patch: { recurrence: 'custom', recurrence_interval_days: 0 } },
  ])('asks for a date, the way Run it back does, when the source $why', async ({ patch }) => {
    state.source = { ...PAST_PLAN, ...patch };

    await landsOn(scheduleNextOccurrence(SOURCE_ID));

    expect(insertsInto('events')[0]).toMatchObject({ status: 'deciding', starts_at: null });
    expect(insertsInto('polls')).toHaveLength(1);
    expect(mocks.openDecidingPlan).toHaveBeenCalledWith(expect.anything(), 'clone-1', HOST, []);
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
  });

  it('never sends invitations for a date already in the past, however far behind the cadence is', async () => {
    // Daily since June 2024: more steps behind than the roll-forward loop takes.
    state.source = { ...PAST_PLAN, recurrence: 'daily', starts_at: '2024-06-01T18:00:00.000Z' };

    await landsOn(scheduleNextOccurrence(SOURCE_ID));

    // It used to go out as "inviting" on 2025-11-04 — ten months ago.
    expect(insertsInto('events')[0]).toMatchObject({ status: 'deciding', starts_at: null });
    expect(insertsInto('polls')).toHaveLength(1);
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
  });

  it('reports a failed read of the cadence with its code and writes nothing', async () => {
    failSessionRead('events');

    const result = await scheduleNextOccurrence(SOURCE_ID);

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE' });
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'event.clone', userCode: 'SB-PLAN-CLONE', context: { sourceId: SOURCE_ID, step: 'next-date' } }),
    ]);
    expect(state.adminInserts).toEqual([]);
  });

  it('removes a half-made dated clone and sends nothing when a write fails', async () => {
    state.source = { ...PAST_PLAN, recurrence: 'weekly' };
    failAdminInsert('invites');

    const result = await scheduleNextOccurrence(SOURCE_ID);

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE' });
    expect(state.adminDeletes).toEqual([
      { table: 'events', id: 'clone-1' },
      { table: 'rooms', id: 'room-new' },
    ]);
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
