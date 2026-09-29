import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Open Table (G20): everyone who can answer a request hears about it, and the
 * person who asked hears the answer, including "not this time".
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  sessionFrom: vi.fn(),
  adminFrom: vi.fn(),
  notifyUsers: vi.fn(async () => ({ recorded: true })),
  checkRateLimit: vi.fn(async () => true),
  reportOperationalError: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.adminFrom, rpc: vi.fn(async () => ({ data: null, error: null })) }),
}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed' })),
}));

import { declineJoinRequest, requestToJoin } from './open-table';

/** A chainable read that resolves to `result` however it is filtered. */
function read(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'asker' },
    supabase: { rpc: mocks.rpc, from: mocks.sessionFrom },
  });
  mocks.checkRateLimit.mockResolvedValue(true);
});

describe('requestToJoin', () => {
  it('tells the host and every co-host, never the asker', async () => {
    mocks.rpc.mockResolvedValue({ data: 'invite-1', error: null });
    mocks.adminFrom.mockImplementation((table: string) =>
      table === 'events'
        ? read({ data: { id: 'event-1', title: 'Supper', host_id: 'host' }, error: null })
        : read({ data: [{ cohost_id: 'cohost-a' }, { cohost_id: 'cohost-b' }, { cohost_id: 'host' }], error: null }),
    );

    const result = await requestToJoin('event-1');

    expect(result).toMatchObject({ ok: true, outcome: 'requested' });
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    const [recipients, payload] = mocks.notifyUsers.mock.calls[0] as unknown as [string[], { kind: string }];
    expect([...recipients].sort()).toEqual(['cohost-a', 'cohost-b', 'host']);
    expect(payload.kind).toBe('join_request');
  });

  it('stops a turned-down asker from asking over and over', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await requestToJoin('event-1');

    expect(result).toMatchObject({ ok: false, code: 'SB-RATE-LIMIT' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('join-request:asker:event-1', 3, 86_400);
  });
});

describe('declineJoinRequest', () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'host' },
      supabase: { rpc: mocks.rpc, from: mocks.sessionFrom },
    });
  });

  it('tells the requester, naming the plan the request belonged to', async () => {
    mocks.sessionFrom.mockReturnValue(
      read({ data: { event_id: 'event-1', event: { title: 'Supper' } }, error: null }),
    );
    mocks.rpc.mockResolvedValue({ data: 'asker', error: null });

    // The client's event id is ignored for everything but the refresh: the
    // plan named in the notice is the one the request was on.
    const result = await declineJoinRequest('invite-1', 'some-other-event');

    expect(mocks.rpc).toHaveBeenCalledWith('decline_join_request', { p_invite: 'invite-1' });
    expect(result).toMatchObject({ ok: true, outcome: 'declined' });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['asker'],
      expect.objectContaining({
        kind: 'join_declined',
        body: expect.stringContaining('Supper'),
        url: '/discover',
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1');
  });

  it('says nothing to anyone when the request was already answered', async () => {
    mocks.sessionFrom.mockReturnValue(read({ data: null, error: null }));
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const result = await declineJoinRequest('invite-1', 'event-1');

    expect(result).toMatchObject({ ok: true, outcome: 'gone' });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('reports a refused decline with its code', async () => {
    mocks.sessionFrom.mockReturnValue(read({ data: null, error: null }));
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'host only' } });

    const result = await declineJoinRequest('invite-1', 'event-1');

    expect(result).toMatchObject({ ok: false, code: 'SB-RSVP-SAVE' });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});
