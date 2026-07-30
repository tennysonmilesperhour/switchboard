import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The RSVP gate: reading an invitation link needs no account, answering one
 * needs a signed-in session.
 *
 * Both public entry points are covered — the plan-wide share link
 * (`respondViaShareLink`, the only path that can mint an invite row for someone
 * who was never invited) and a person's own guest token
 * (`respondToGuestInvite`). For each: a signed-out caller is refused *before*
 * anything is written, and a signed-in one gets through carrying an identity the
 * host can actually see.
 *
 * The database enforces the same rule for the share link
 * (`supabase/tests/event_share_links.test.sql`); this pins the server actions, so
 * the two can't drift into a gate that only the UI believes in.
 */

const mocks = vi.hoisted(() => {
  const db: {
    /** The session `auth.getUser()` resolves to, or null for signed out. */
    user: { id: string } | null;
    profiles: Record<string, { display_name: string | null }>;
    invites: Record<string, { id: string; event_id: string; status: string; guest_name: string }>;
    events: Record<string, { id: string; title: string; host_id: string }>;
    /** share_token → event id, the way `/i/<token>` resolves a plan. */
    shareTokens: Record<string, string>;
  } = { user: null, profiles: {}, invites: {}, events: {}, shareTokens: {} };

  function resolve(table: string, eqs: Record<string, unknown>) {
    if (table === 'profiles') {
      return { data: db.profiles[String(eqs.id)] ?? null, error: null };
    }
    if (table === 'invites') {
      return { data: db.invites[String(eqs.guest_token)] ?? null, error: null };
    }
    if (table === 'events') {
      const id =
        eqs.share_token != null
          ? db.shareTokens[String(eqs.share_token)]
          : String(eqs.id);
      return { data: db.events[String(id)] ?? null, error: null };
    }
    return { data: null, error: null };
  }

  /** Minimal chainable PostgREST stand-in. */
  function makeBuilder(table: string) {
    const eqs: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        eqs[col] = val;
        return b;
      },
      order: () => b,
      maybeSingle: async () => resolve(table, eqs),
      single: async () => resolve(table, eqs),
      then: (
        onFulfilled: (value: { data: unknown; error: null }) => unknown,
      ) => Promise.resolve(resolve(table, eqs)).then(onFulfilled),
    };
    return b;
  }

  const rpc = vi.fn(async (name: string) => {
    if (name === 'rsvp_via_share_token') {
      return { data: [{ outcome: 'accepted', token: 'guest-token-1' }], error: null };
    }
    if (name === 'respond_to_guest_invite') return { data: 'accepted', error: null };
    return { data: null, error: null };
  });

  // `claim_guest_invite` resolves the caller from `auth.uid()`, so it must run
  // on the session-scoped client — never the service-role one, which has no
  // session and would claim nothing.
  const userRpc = vi.fn(
    async (): Promise<{ data: string | null; error: { message: string } | null }> => ({
      data: 'event-1',
      error: null,
    }),
  );

  return {
    db,
    rpc,
    userRpc,
    makeBuilder,
    checkRateLimit: vi.fn(async () => true),
    advanceEventCascade: vi.fn(async () => undefined),
    notifyUsers: vi.fn(async () => undefined),
    reportOperationalError: vi.fn(async () => undefined),
    capture: vi.fn(async () => undefined),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.db.user }, error: null }) },
    rpc: mocks.userRpc,
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: () => true,
  createAdminClient: () => ({
    from: (table: string) => mocks.makeBuilder(table),
    rpc: mocks.rpc,
  }),
}));

vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/cascade-runner', () => ({
  advanceEventCascade: mocks.advanceEventCascade,
}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));
vi.mock('@/lib/analytics/server', () => ({ capture: mocks.capture }));

import { respondViaShareLink, respondToGuestInvite } from './invites';

afterEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.userRpc.mockResolvedValue({ data: 'event-1', error: null });
  mocks.db.user = null;
  mocks.db.profiles = {};
  mocks.db.invites = {};
  mocks.db.events = {};
  mocks.db.shareTokens = {};
});

describe('respondViaShareLink', () => {
  it('refuses a signed-out responder without touching the database', async () => {
    const result = await respondViaShareLink('share-token', true, 'Jordan');

    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('auth_required');
    expect(result.error).toMatch(/sign in/i);
    // The point of failing here: no invite row, so a host is never shown an
    // answer from someone they can never reach.
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('records a signed-in RSVP under the session id and the profile name', async () => {
    mocks.db.user = { id: 'user-1' };
    mocks.db.profiles['user-1'] = { display_name: 'Dana Ross' };
    mocks.db.events['event-1'] = { id: 'event-1', title: 'Taco night', host_id: 'host-1' };
    mocks.db.shareTokens['share-token'] = 'event-1';

    const result = await respondViaShareLink('share-token', true, 'Not My Name');

    expect(result).toMatchObject({ ok: true, outcome: 'accepted', token: 'guest-token-1' });
    expect(mocks.rpc).toHaveBeenCalledWith('rsvp_via_share_token', {
      p_token: 'share-token',
      // The session id, never a client-supplied one — auth.uid() is null under
      // the service role, so this argument *is* the identity.
      p_user: 'user-1',
      // The profile's name wins over whatever the browser posted.
      p_name: 'Dana Ross',
      p_contact: null,
      p_accept: true,
    });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['host-1'],
      expect.objectContaining({ body: expect.stringContaining('Dana Ross') }),
    );
  });

  it('falls back to the posted name for an account whose profile has none yet', async () => {
    mocks.db.user = { id: 'user-2' };
    mocks.db.profiles['user-2'] = { display_name: '   ' };
    mocks.db.events['event-1'] = { id: 'event-1', title: 'Taco night', host_id: 'host-1' };
    mocks.db.shareTokens['share-token'] = 'event-1';

    await respondViaShareLink('share-token', true, 'Jordan');

    expect(mocks.rpc).toHaveBeenCalledWith(
      'rsvp_via_share_token',
      expect.objectContaining({ p_user: 'user-2', p_name: 'Jordan' }),
    );
  });
});

describe('respondToGuestInvite', () => {
  it('refuses a signed-out guest without recording an answer', async () => {
    mocks.db.invites['guest-token-1'] = {
      id: 'invite-1',
      event_id: 'event-1',
      status: 'sent',
      guest_name: 'Casey',
    };

    const result = await respondToGuestInvite('guest-token-1', true);

    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('auth_required');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('records the answer once the guest is signed in', async () => {
    mocks.db.user = { id: 'user-3' };
    mocks.db.invites['guest-token-1'] = {
      id: 'invite-1',
      event_id: 'event-1',
      status: 'sent',
      guest_name: 'Casey',
    };
    mocks.db.events['event-1'] = { id: 'event-1', title: 'Taco night', host_id: 'host-1' };

    const result = await respondToGuestInvite('guest-token-1', true);

    expect(result).toMatchObject({ ok: true, outcome: 'accepted' });
    expect(mocks.rpc).toHaveBeenCalledWith('respond_to_guest_invite', {
      p_token: 'guest-token-1',
      p_accept: true,
    });
  });

  it('binds the answered invite to the account, on the session client', async () => {
    mocks.db.user = { id: 'user-3' };
    mocks.db.invites['guest-token-1'] = {
      id: 'invite-1',
      event_id: 'event-1',
      status: 'sent',
      guest_name: 'Casey',
    };
    mocks.db.events['event-1'] = { id: 'event-1', title: 'Taco night', host_id: 'host-1' };

    const result = await respondToGuestInvite('guest-token-1', true);

    // An accepted invite still carrying invitee_id = null is invisible on
    // /plans and unreachable at /events/<id> — the responder ends up stuck on
    // the confirmation card with no way into the plan they just joined.
    expect(mocks.userRpc).toHaveBeenCalledWith('claim_guest_invite', {
      p_token: 'guest-token-1',
    });
    // Never the service-role client: it has no session, so auth.uid() is null
    // and the claim would silently no-op.
    expect(mocks.rpc).not.toHaveBeenCalledWith('claim_guest_invite', expect.anything());
    // And the caller gets the id it needs to link onward.
    expect(result.eventId).toBe('event-1');
  });

  it('still records a declined answer, and keeps the claim best-effort', async () => {
    mocks.db.user = { id: 'user-3' };
    mocks.db.invites['guest-token-1'] = {
      id: 'invite-1',
      event_id: 'event-1',
      status: 'sent',
      guest_name: 'Casey',
    };
    mocks.db.events['event-1'] = { id: 'event-1', title: 'Taco night', host_id: 'host-1' };
    mocks.userRpc.mockResolvedValue({ data: null, error: { message: 'claim exploded' } });

    const result = await respondToGuestInvite('guest-token-1', true);

    // The RSVP is already written by this point; a failed claim must not throw
    // it away — but it must not pass silently either.
    expect(result.ok).toBe(true);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'guest-rsvp.claim',
      expect.anything(),
      expect.objectContaining({ eventId: 'event-1' }),
    );
  });
});
