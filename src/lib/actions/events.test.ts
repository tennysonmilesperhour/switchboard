import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireUserOrRedirect: vi.fn(),
  checkEventManager: vi.fn(),
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: mocks.requireUser,
  requireUserOrRedirect: mocks.requireUserOrRedirect,
}));
vi.mock('@/lib/server/authz', () => ({
  checkEventManager: mocks.checkEventManager,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/server/cascade-runner', () => ({
  advanceEventCascade: vi.fn(),
  deliverInviteNow: vi.fn(),
  notifyCurrentInviteWave: vi.fn(),
}));
vi.mock('@/lib/server/relationship', () => ({ getRelationship: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ capture: vi.fn() }));
vi.mock('@/lib/server/media', () => ({ isValidMediaRef: vi.fn(() => true) }));
vi.mock('@/lib/server/email', () => ({
  looksLikeEmail: vi.fn(() => false),
  sendEmails: vi.fn(),
}));
vi.mock('@/lib/server/sms', () => ({
  looksLikePhoneNumber: vi.fn(() => false),
  sendSmsMessages: vi.fn(),
}));
vi.mock('@/lib/server/geocode', () => ({ geocode: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(),
  reportOperationalError: mocks.reportOperationalError,
}));

import {
  addPeopleToEvent,
  cancelEvent,
  confirmEvent,
  deleteEventPermanently,
  markHappened,
  startInviting,
  updateEventDetails,
} from './events';
import { notifyUsers } from '@/lib/server/notify';
import { capture } from '@/lib/analytics/server';
import { reportAndFail } from '@/lib/server/observability';

/**
 * A service-role client for the host lifecycle actions. Every write records its
 * table, row, and filters, so a test can assert which status a transition was
 * allowed to start from. `updated` is what the guarded events UPDATE returns
 * (null = no row matched); `current` is what a follow-up read of the plan sees.
 */
function lifecycleAdmin(options: {
  updated: Record<string, unknown> | null;
  error?: { message: string } | null;
  current?: Record<string, unknown> | null;
}) {
  const writes: Array<{
    table: string;
    row: Record<string, unknown>;
    filters: Array<[string, ...unknown[]]>;
  }> = [];
  const admin = {
    from(table: string) {
      let write: (typeof writes)[number] | null = null;
      const filters: Array<[string, ...unknown[]]> = [];
      const result = () =>
        write && table === 'events'
          ? { data: options.updated, error: options.error ?? null }
          : write
            ? { data: null, error: null, count: 0 }
            : { data: options.current ?? null, error: null, count: 0 };
      const builder: Record<string, unknown> = {};
      const record =
        (op: string) =>
        (...args: unknown[]) => {
          filters.push([op, ...args]);
          return builder;
        };
      Object.assign(builder, {
        update: (row: Record<string, unknown>) => {
          write = { table, row, filters };
          writes.push(write);
          return builder;
        },
        select: () => builder,
        eq: record('eq'),
        neq: record('neq'),
        in: record('in'),
        not: record('not'),
        lte: record('lte'),
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      });
      return builder;
    },
  };
  return { admin, writes };
}

/**
 * A service-role client just deep enough for `updateEventDetails`: the "before"
 * read, the update, and the accepted-guest lookup that decides who hears about
 * a change.
 */
function editAdmin(before: { starts_at: string | null; location_name: string | null }) {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { ...before, location_address: null, title: 'Dinner' },
              }),
            }),
          }),
          update: (row: Record<string, unknown>) => {
            updates.push(row);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      // invites: the accepted guests who would be told about a change.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: async () => ({ data: [{ invitee_id: 'guest-1' }] }),
            }),
          }),
        }),
      };
    },
  };
  return { admin, updates };
}

const EDIT = {
  title: 'Dinner',
  description: 'Dumplings.',
  locationName: 'Mei Wei',
  locationAddress: null,
  endsAt: null,
  timeZone: null,
  capacity: null,
  wishlistUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  const supabase = { rpc: mocks.rpc };
  mocks.requireUser.mockResolvedValue({
    ok: true,
    supabase,
    user: { id: 'user-1' },
  });
  mocks.requireUserOrRedirect.mockResolvedValue({
    supabase,
    user: { id: 'user-1' },
  });
  mocks.checkEventManager.mockResolvedValue({ ok: true, isManager: true });
  mocks.rpc.mockResolvedValue({ data: 'deleted', error: null });
  mocks.createAdminClient.mockImplementation(() => {
    throw new Error('Admin client should not be reached');
  });
});

describe('event management actions', () => {
  it('refuses addPeopleToEvent before any privileged read for a non-manager', async () => {
    mocks.checkEventManager.mockResolvedValue({ ok: true, isManager: false });

    const result = await addPeopleToEvent('event-1', {
      profileIds: ['person-1'],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'SB-PERM-HOST',
      error: 'Only the host can add people.',
    });
    expect(mocks.checkEventManager).toHaveBeenCalledWith('user-1', 'event-1');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('reports a manager check that could not run as an operational failure, not a refusal', async () => {
    mocks.checkEventManager.mockResolvedValue({ ok: false, isManager: false });

    const result = await addPeopleToEvent('event-1', { profileIds: ['person-1'] });

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-AUTHZ' });
    expect(result.error).not.toBe('Only the host can add people.');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  /**
   * `createEvent` refuses a plan with neither a place nor a detail, because a
   * recipient cannot answer a bare title. The edit that can undo it has to
   * refuse the same thing: by the time anyone edits, the invitations are out,
   * so a plan saved back to a title alone leaves every link the host has
   * already sent showing a name and nothing else.
   */
  it('refuses an edit that strips a published plan back to a bare title', async () => {
    const result = await updateEventDetails('event-1', {
      title: 'Dinner',
      description: '   ',
      locationName: null,
      locationAddress: null,
      startsAt: null,
      endsAt: null,
      timeZone: null,
      capacity: null,
      wishlistUrl: null,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Add a location or a short detail');
    // Refused before the service-role client is touched, like every other
    // guard in this file.
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['a place and no words', 'Mei Wei', null],
    ['words and no place', null, 'Dumplings, then a walk.'],
  ])('lets an edit through with %s', async (_label, locationName, description) => {
    // Either one is enough, so the guard must not stand in the way. The write
    // itself is out of scope here: this suite gives `createAdminClient` a
    // throwing stub, so reaching it is what "got past the guard" looks like.
    await expect(
      updateEventDetails('event-1', {
        title: 'Dinner',
        description,
        locationName,
        locationAddress: null,
        startsAt: null,
        endsAt: null,
        timeZone: null,
        capacity: null,
        wishlistUrl: null,
      }),
    ).rejects.toThrow('Admin client should not be reached');
  });

  /**
   * The row comes back as `...+00:00` and the form sends `...000Z`. Compared as
   * strings those differ, so every save of a dated plan told every accepted
   * guest "the time changed" - an urgent change inside the last two hours.
   */
  it('does not tell guests the time changed when only the words did', async () => {
    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setUTCSeconds(0, 0);
    const { admin } = editAdmin({
      starts_at: start.toISOString().replace('.000Z', '+00:00'),
      location_name: 'Mei Wei',
    });
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await updateEventDetails('event-1', {
      ...EDIT,
      startsAt: start.toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(vi.mocked(notifyUsers)).not.toHaveBeenCalled();
  });

  it('still tells guests when the time really moved', async () => {
    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setUTCSeconds(0, 0);
    const later = new Date(start.getTime() + 30 * 60_000);
    const { admin } = editAdmin({
      starts_at: start.toISOString().replace('.000Z', '+00:00'),
      location_name: 'Mei Wei',
    });
    mocks.createAdminClient.mockReturnValue(admin);

    await updateEventDetails('event-1', { ...EDIT, startsAt: later.toISOString() });

    expect(vi.mocked(notifyUsers)).toHaveBeenCalledWith(
      ['guest-1'],
      expect.objectContaining({ body: expect.stringContaining('The time for Dinner changed') }),
    );
  });

  it('refuses an edit that ends the plan before it starts', async () => {
    const start = new Date(Date.now() + 86_400_000);
    const result = await updateEventDetails('event-1', {
      ...EDIT,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() - 3_600_000).toISOString(),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('End time should be after the start time.');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('refuses moving a plan into the past, but not editing one already under way', async () => {
    const past = new Date(Date.now() - 3_600_000);
    past.setUTCSeconds(0, 0);

    // Moving it there: refused.
    mocks.createAdminClient.mockReturnValue(
      editAdmin({
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        location_name: 'Mei Wei',
      }).admin,
    );
    const moved = await updateEventDetails('event-1', { ...EDIT, startsAt: past.toISOString() });
    expect(moved.ok).toBe(false);
    expect(moved.error).toContain('already passed');

    // Already there, fixing the details mid-plan: allowed.
    const { admin, updates } = editAdmin({
      starts_at: past.toISOString().replace('.000Z', '+00:00'),
      location_name: 'Mei Wei',
    });
    mocks.createAdminClient.mockReturnValue(admin);
    const fixed = await updateEventDetails('event-1', {
      ...EDIT,
      description: 'Dumplings, then the park.',
      startsAt: past.toISOString(),
    });
    expect(fixed.ok).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it.each([0, -2, 2.5])('refuses a capacity of %s with a sentence', async (capacity) => {
    const result = await updateEventDetails('event-1', {
      ...EDIT,
      startsAt: null,
      capacity,
    });
    expect(result).toMatchObject({ ok: false, error: 'Spots must be a whole number of at least 1.' });
  });

  it('refuses cancellation before any privileged read for a non-manager', async () => {
    mocks.checkEventManager.mockResolvedValue({ ok: true, isManager: false });

    await expect(cancelEvent('event-1', 'Changed plans')).resolves.toMatchObject({
      ok: false,
      code: 'SB-PERM-HOST',
    });

    expect(mocks.checkEventManager).toHaveBeenCalledWith('user-1', 'event-1');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['confirmEvent', confirmEvent],
    ['startInviting', startInviting],
    ['markHappened', markHappened],
  ] as const)('%s tells a non-manager no, instead of doing nothing', async (_name, action) => {
    mocks.checkEventManager.mockResolvedValue({ ok: true, isManager: false });
    await expect(action('event-1')).resolves.toMatchObject({ ok: false, code: 'SB-PERM-HOST' });

    mocks.checkEventManager.mockResolvedValue({ ok: false, isManager: false });
    await expect(action('event-1')).resolves.toMatchObject({ ok: false, code: 'SB-PLAN-AUTHZ' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  /**
   * A stale tab or a direct call used to move a cancelled or past plan back to
   * `inviting` (or `confirmed`), reopening its share link. The source status is
   * part of the UPDATE's own WHERE, and a row that no longer matches is a coded
   * failure rather than a quiet success.
   */
  it.each([
    ['confirmEvent', confirmEvent, 'confirmed', 'inviting'],
    ['startInviting', startInviting, 'inviting', 'deciding'],
  ] as const)(
    '%s only moves a plan from its one valid status',
    async (_name, action, target, source) => {
      const { admin, writes } = lifecycleAdmin({ updated: null });
      mocks.createAdminClient.mockReturnValue(admin);

      const result = await action('event-1');

      expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-SAVE' });
      expect(result.error).toContain('moved on');
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        table: 'events',
        row: { status: target },
        filters: expect.arrayContaining([
          ['eq', 'id', 'event-1'],
          ['eq', 'status', source],
        ]),
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('confirms an inviting plan and retires the invitations still in motion', async () => {
    const { admin, writes } = lifecycleAdmin({ updated: { id: 'event-1' } });
    mocks.createAdminClient.mockReturnValue(admin);

    await expect(confirmEvent('event-1')).resolves.toEqual({ ok: true });

    expect(writes.map((write) => write.table)).toEqual(['events', 'invites']);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1');
  });

  it('reports a failed status write with a code', async () => {
    const { admin } = lifecycleAdmin({ updated: null, error: { message: 'boom' } });
    mocks.createAdminClient.mockReturnValue(admin);
    vi.mocked(reportAndFail).mockResolvedValueOnce({
      ok: false,
      code: 'SB-PLAN-SAVE',
      error: 'Your changes to this plan didn’t save.',
      fix: null,
    });

    const result = await startInviting('event-1');

    expect(vi.mocked(reportAndFail)).toHaveBeenCalledWith(
      'SB-PLAN-SAVE',
      'event-update',
      { message: 'boom' },
      expect.objectContaining({ eventId: 'event-1' }),
    );
    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-SAVE' });
  });

  it('says so when the server does not agree the plan has started yet', async () => {
    // The button is offered on the device's clock. A phone running fast used
    // to get a tap that did nothing at all.
    const { admin } = lifecycleAdmin({
      updated: null,
      current: {
        status: 'confirmed',
        starts_at: new Date(Date.now() + 3_600_000).toISOString().replace('.000Z', '+00:00'),
      },
    });
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await markHappened('event-1');

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-SAVE' });
    expect(result.error).toContain('hasn’t started yet');
  });

  it('treats marking an already-past plan as done, without re-counting it', async () => {
    const { admin, writes } = lifecycleAdmin({
      updated: null,
      current: { status: 'past', starts_at: new Date(Date.now() - 3_600_000).toISOString() },
    });
    mocks.createAdminClient.mockReturnValue(admin);

    await expect(markHappened('event-1')).resolves.toEqual({ ok: true });
    expect(writes).toHaveLength(1);
    expect(vi.mocked(capture)).not.toHaveBeenCalled();
  });

  it('does not re-cancel a plan that is already closed', async () => {
    const { admin, writes } = lifecycleAdmin({ updated: null });
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await cancelEvent('event-1', 'Rain');

    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-SAVE' });
    expect(writes).toHaveLength(1);
    expect(writes[0].filters).toEqual(
      expect.arrayContaining([
        ['neq', 'status', 'cancelled'],
        ['neq', 'status', 'past'],
      ]),
    );
    expect(vi.mocked(notifyUsers)).not.toHaveBeenCalled();
  });

  it('checks blocks against the host through the service-role client and skips blocked members', async () => {
    // The two-id `are_blocked` is not executable by a browser role (security
    // migration M1-M3), and the relationship that matters is the host's, not
    // the co-host's who may be doing the adding.
    const tables: Record<string, unknown[]> = {
      events: [
        { id: 'event-1', host_id: 'host-1', status: 'inviting', invite_mode: 'group', starts_at: null },
      ],
      profiles: [
        { id: 'person-1', display_name: 'Alice' },
        { id: 'person-2', display_name: 'Bob' },
      ],
      invites: [],
    };
    const inserted: unknown[] = [];
    const adminRpc = vi.fn(async (name: string, args: { p_user_b?: string }) => ({
      data: name === 'are_blocked' && args.p_user_b === 'person-2',
      error: null,
    }));
    const from = vi.fn((table: string) => {
      const rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        in: chain,
        order: chain,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        insert: async (payload: unknown) => {
          inserted.push(payload);
          return { data: null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: rows, error: null }),
      });
      return builder;
    });
    mocks.createAdminClient.mockImplementation(() => ({ from, rpc: adminRpc }));

    const result = await addPeopleToEvent('event-1', {
      profileIds: ['person-1', 'person-2'],
    });

    expect(result).toMatchObject({ ok: true, added: 1 });
    expect(result.skipped).toEqual([{ entry: 'Bob', reason: 'blocked relationship' }]);
    expect(adminRpc).toHaveBeenCalledWith('are_blocked', { p_user_a: 'host-1', p_user_b: 'person-1' });
    expect(adminRpc).toHaveBeenCalledWith('are_blocked', { p_user_a: 'host-1', p_user_b: 'person-2' });
    expect(mocks.rpc).not.toHaveBeenCalledWith('are_blocked', expect.anything());
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual([expect.objectContaining({ invitee_id: 'person-1', status: 'queued' })]);
  });

  it('requires cancellation before permanently deleting accepted guests', async () => {
    mocks.rpc.mockResolvedValue({ data: 'accepted_guests', error: null });

    const result = await deleteEventPermanently('event-1');

    expect(mocks.rpc).toHaveBeenCalledWith('delete_hosted_event_permanently', {
      p_event: 'event-1',
    });
    expect(result).toEqual({
      ok: false,
      error: 'Cancel the plan first so everyone who accepted is notified.',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates both plan surfaces after permanent deletion', async () => {
    const result = await deleteEventPermanently('event-1');

    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/plans');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
  });
});
