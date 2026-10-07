import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Run it back / Schedule the next one (G27, D19): a failed clone says so with
 * a code and leaves nothing half-made; every write is checked; co-hosts carry
 * over under the D1 rule; and a clone with no date opens as a date poll.
 */

type Row = Record<string, unknown>;
type Result = { data?: unknown; error?: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  source: null as Row | null,
  prior: [] as Row[],
  questions: [] as Row[],
  cohosts: [] as Row[],
  /** Errors to return from admin inserts, by table. */
  adminInsertError: {} as Record<string, { message: string } | undefined>,
  /** Per co-host id, the error its session insert returns. */
  cohostInsertError: {} as Record<string, { code: string; message: string } | undefined>,
  adminInserts: [] as Array<{ table: string; rows: unknown }>,
  adminUpserts: [] as Array<{ table: string; rows: unknown }>,
  adminDeletes: [] as Array<{ table: string; id: unknown }>,
  sessionCohostInserts: [] as Row[],
  /** Rows of profile_blocks the clone's block lookup returns. */
  blocks: [] as Row[],
}));

const mocks = vi.hoisted(() => ({
  checkEventManager: vi.fn(),
  advanceEventCascade: vi.fn(async () => undefined),
  openDecidingPlan: vi.fn(async () => undefined),
  notifyUsers: vi.fn(async () => ({ recorded: true })),
  reportOperationalError: vi.fn(async (...args: unknown[]) => void args),
}));

function thenable(result: Result) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    or: () => builder,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: unknown) => unknown) => resolve({ error: null, ...result }),
  };
  return builder;
}

const session = {
  from(table: string) {
    if (table === 'events') return thenable({ data: state.source, error: null });
    if (table === 'invites') return thenable({ data: state.prior, error: null });
    if (table === 'event_questions') return thenable({ data: state.questions, error: null });
    if (table === 'event_cohosts') {
      const builder = thenable({ data: state.cohosts, error: null });
      builder.insert = async (row: Row) => {
        state.sessionCohostInserts.push(row);
        return { error: state.cohostInsertError[String(row.cohost_id)] ?? null };
      };
      return builder;
    }
    throw new Error(`unexpected session table ${table}`);
  },
};

const admin = {
  from(table: string) {
    return {
      select() {
        return thenable({ data: table === 'profile_blocks' ? state.blocks : [], error: null });
      },
      insert(rows: unknown) {
        state.adminInserts.push({ table, rows });
        const error = state.adminInsertError[table] ?? null;
        const data = table === 'rooms' ? { id: 'room-new' } : table === 'events' ? { id: 'clone-1' } : null;
        return thenable({ data: error ? null : data, error });
      },
      upsert(rows: unknown) {
        state.adminUpserts.push({ table, rows });
        return thenable({ data: null, error: null });
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
  },
};

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/server/authz', () => ({ checkEventManager: mocks.checkEventManager }));
vi.mock('@/lib/server/cascade-runner', () => ({ advanceEventCascade: mocks.advanceEventCascade }));
vi.mock('@/lib/server/poll-notices', () => ({ openDecidingPlan: mocks.openDecidingPlan }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
  reportAndFail: vi.fn(async (code: string, area: string) => {
    await mocks.reportOperationalError(area);
    return { ok: false, code, error: 'failed' };
  }),
}));

import { cloneEventForReuse } from './event-clone';

const SOURCE: Row = {
  id: 'source-1',
  host_id: 'host',
  title: 'Taco night',
  status: 'past',
  recurrence: 'none',
  recurrence_interval_days: null,
  parental_approval: false,
};

function insertsInto(table: string) {
  return state.adminInserts.filter((entry) => entry.table === table).map((entry) => entry.rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.source = { ...SOURCE };
  state.prior = [
    { invitee_id: 'guest-1', guest_name: null, guest_contact: null, position: 0, group_stage: 0, window_minutes: 60, decline_note: null, status: 'accepted' },
    { invitee_id: 'guest-2', guest_name: null, guest_contact: null, position: 1, group_stage: 0, window_minutes: 60, decline_note: 'not_my_thing', status: 'declined' },
  ];
  state.questions = [{ prompt: 'Spice level?', required: false, position: 0, kind: 'text', options: [] }];
  state.cohosts = [];
  state.adminInsertError = {};
  state.cohostInsertError = {};
  state.adminInserts = [];
  state.adminUpserts = [];
  state.adminDeletes = [];
  state.sessionCohostInserts = [];
  state.blocks = [];
  mocks.checkEventManager.mockResolvedValue({ ok: true, isManager: true });
});

describe('cloneEventForReuse', () => {
  it('opens Run it back as a date poll and asks the crew when (D19)', async () => {
    const result = await cloneEventForReuse('host', 'source-1', null);

    expect(result).toEqual({ ok: true, eventId: 'clone-1' });
    expect(insertsInto('events')[0]).toMatchObject({ status: 'deciding', starts_at: null, host_id: 'host' });
    expect(insertsInto('polls')[0]).toMatchObject({ event_id: 'clone-1', topic: 'date' });
    expect(mocks.openDecidingPlan).toHaveBeenCalledWith(session, 'clone-1', 'host', []);
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
    // The crew, minus "not my thing", in order.
    expect(insertsInto('invites')[0]).toEqual([
      expect.objectContaining({ event_id: 'clone-1', invitee_id: 'guest-1', position: 0 }),
    ]);
    expect(insertsInto('event_questions')[0]).toEqual([
      expect.objectContaining({ event_id: 'clone-1', prompt: 'Spice level?' }),
    ]);
  });

  it('leaves out someone blocked since the last plan instead of failing the whole clone', async () => {
    state.blocks = [{ blocker_id: 'guest-1', blocked_id: 'host' }];

    const result = await cloneEventForReuse('host', 'source-1', null);

    expect(result).toEqual({ ok: true, eventId: 'clone-1' });
    expect(insertsInto('invites')).toEqual([]);
  });

  it('sends a dated next occurrence straight out as invitations', async () => {
    const result = await cloneEventForReuse('host', 'source-1', '2026-11-01T18:00:00.000Z');

    expect(result).toMatchObject({ ok: true });
    expect(insertsInto('events')[0]).toMatchObject({ status: 'inviting', starts_at: '2026-11-01T18:00:00.000Z' });
    expect(insertsInto('polls')).toEqual([]);
    expect(mocks.advanceEventCascade).toHaveBeenCalledWith('clone-1');
    expect(mocks.openDecidingPlan).not.toHaveBeenCalled();
  });

  it('reports a failed write with its code and removes what was made (G27)', async () => {
    state.adminInsertError.invites = { message: 'boom' };

    const result = await cloneEventForReuse('host', 'source-1', null);

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE' });
    expect(state.adminDeletes).toEqual([
      { table: 'events', id: 'clone-1' },
      { table: 'rooms', id: 'room-new' },
    ]);
    expect(mocks.openDecidingPlan).not.toHaveBeenCalled();
  });

  it('reports a plan that could not be created, and removes its room', async () => {
    state.adminInsertError.events = { message: 'boom' };

    const result = await cloneEventForReuse('host', 'source-1', null);

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE' });
    expect(state.adminDeletes).toEqual([{ table: 'rooms', id: 'room-new' }]);
  });

  it('carries co-hosts over under the D1 rule, and tells the ones who came', async () => {
    state.cohosts = [{ cohost_id: 'friend' }, { cohost_id: 'since-blocked' }];
    state.cohostInsertError['since-blocked'] = { code: '42501', message: 'row-level security' };

    const result = await cloneEventForReuse('host', 'source-1', null);

    expect(result).toMatchObject({ ok: true });
    expect(state.sessionCohostInserts).toEqual([
      { event_id: 'clone-1', cohost_id: 'friend', added_by: 'host' },
      { event_id: 'clone-1', cohost_id: 'since-blocked', added_by: 'host' },
    ]);
    expect(state.adminUpserts).toEqual([
      { table: 'room_members', rows: [{ room_id: 'room-new', member_id: 'friend' }] },
    ]);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['friend'],
      expect.objectContaining({ kind: 'cohost_added', url: '/events/clone-1' }),
    );
    // A refusal by the policy is the rule working, not an incident.
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });

  it('refuses a co-host: running a plan back is the primary host’s', async () => {
    const result = await cloneEventForReuse('cohost', 'source-1', null);

    expect(result).toMatchObject({ ok: false, code: 'SB-PERM-HOST' });
    expect(state.adminInserts).toEqual([]);
  });

  it('says it could not check, rather than refusing, when the manager check fails', async () => {
    mocks.checkEventManager.mockResolvedValue({ ok: false, isManager: false });

    const result = await cloneEventForReuse('host', 'source-1', null);

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-AUTHZ' });
    expect(state.adminInserts).toEqual([]);
  });
});
