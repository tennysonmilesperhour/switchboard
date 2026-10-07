import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Decision D1: a co-host must be the primary host's connection or someone on
 * this plan's guest list. The `event_cohosts_host` policy is the rule that
 * holds (supabase/tests/cohost_access.test.sql); this pins the action in front
 * of it — refusing early with a sentence rather than a code, never writing a
 * row for a stranger, and telling the new co-host when it does.
 */

const mocks = vi.hoisted(() => {
  const state = {
    profile: { id: 'friend-1', display_name: 'Robin' } as { id: string; display_name: string } | null,
    event: { id: 'event-1', title: 'Taco night', host_id: 'host-1', room_id: null } as
      | { id: string; title: string; host_id: string; room_id: string | null }
      | null,
    connected: false,
    blocked: false,
    invited: false,
    insertError: null as { code: string } | null,
    removed: [{ cohost_id: 'friend-1' }] as Array<{ cohost_id: string }>,
  };
  const inserts: Array<{ table: string; row: unknown }> = [];

  function from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      limit: async () => ({ data: state.invited ? [{ id: 'invite-1' }] : [], error: null }),
      maybeSingle: async () => ({
        data:
          table === 'events'
            ? state.event
            : table === 'profiles'
              ? state.profile
              : null,
        error: null,
      }),
      delete: () => ({
        eq: () => ({
          eq: () => ({ select: async () => ({ data: state.removed, error: null }) }),
        }),
      }),
      insert: async (row: unknown) => {
        inserts.push({ table, row });
        return { error: table === 'event_cohosts' ? state.insertError : null };
      },
    };
    return builder;
  }

  const rpc = vi.fn(async (name: string) => ({
    data: name === 'is_connected_with' ? state.connected : state.blocked,
    error: null,
  }));

  return {
    state,
    inserts,
    supabase: { from, rpc },
    notifyUsers: vi.fn(async () => ({ recorded: true })),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({ ok: true, user: { id: 'host-1' }, supabase: mocks.supabase }),
}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async () => ({ ok: false, code: 'SB-PLAN-SAVE', error: 'x', fix: null })),
}));

import { addCoHost, removeCoHost } from './event-cohosts';

afterEach(() => {
  vi.clearAllMocks();
  mocks.inserts.length = 0;
  Object.assign(mocks.state, {
    profile: { id: 'friend-1', display_name: 'Robin' },
    event: { id: 'event-1', title: 'Taco night', host_id: 'host-1', room_id: null },
    connected: false,
    blocked: false,
    invited: false,
    insertError: null,
  });
});

describe('addCoHost (decision D1)', () => {
  it('refuses a stranger before writing anything', async () => {
    const result = await addCoHost('event-1', '@robin');

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('error', expect.stringMatching(/connected with or who’s already invited/));
    expect(mocks.inserts).toEqual([]);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('refuses a connection across a block', async () => {
    mocks.state.connected = true;
    mocks.state.blocked = true;

    const result = await addCoHost('event-1', 'robin');

    expect(result.ok).toBe(false);
    expect(mocks.inserts).toEqual([]);
  });

  it('adds a connection and tells them, with a link to the plan', async () => {
    mocks.state.connected = true;

    const result = await addCoHost('event-1', 'robin');

    expect(result).toEqual({ ok: true });
    expect(mocks.inserts).toContainEqual({
      table: 'event_cohosts',
      row: { event_id: 'event-1', cohost_id: 'friend-1', added_by: 'host-1' },
    });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['friend-1'],
      expect.objectContaining({
        kind: 'cohost_added',
        url: '/events/event-1',
        body: expect.stringContaining('Taco night'),
      }),
    );
  });

  it('adds someone already on the guest list', async () => {
    mocks.state.invited = true;

    const result = await addCoHost('event-1', 'robin');

    expect(result.ok).toBe(true);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
  });

  it('only lets the primary host add co-hosts', async () => {
    mocks.state.connected = true;
    mocks.state.event = { id: 'event-1', title: 'Taco night', host_id: 'someone-else', room_id: null };

    const result = await addCoHost('event-1', 'robin');

    expect(result).toMatchObject({ ok: false, code: 'SB-PERM-HOST' });
    expect(mocks.inserts).toEqual([]);
  });

  it('reads the database refusing the row as the same D1 answer, not an incident', async () => {
    mocks.state.connected = true;
    mocks.state.insertError = { code: '42501' };

    const result = await addCoHost('event-1', 'robin');

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('code');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});

describe('removeCoHost', () => {
  it('removes the co-host when the caller is the host', async () => {
    mocks.state.removed = [{ cohost_id: 'friend-1' }];
    expect(await removeCoHost('event-1', 'friend-1')).toEqual({ ok: true });
  });

  it('does not report success when RLS deleted nothing', async () => {
    mocks.state.removed = [];
    const result = await removeCoHost('event-1', 'friend-1');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: 'SB-PERM-HOST' });
  });
});
