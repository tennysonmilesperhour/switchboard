import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  adminRpc: vi.fn(),
  createAdminClient: vi.fn(),
  checkRateLimit: vi.fn(async () => true),
  checkEventManager: vi.fn(),
  isEventManager: vi.fn(),
  advanceEventCascade: vi.fn(),
  notifyUsers: vi.fn(),
  sendEmailWithResult: vi.fn(
    async (): Promise<{ status: string; provider: string }> => ({
      status: 'sent',
      provider: 'resend',
    }),
  ),
  reportOperationalError: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/server/authz', () => ({
  checkEventManager: mocks.checkEventManager,
  isEventManager: mocks.isEventManager,
}));
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock('@/lib/server/email', () => ({
  looksLikeEmail: (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  sendEmailWithResult: mocks.sendEmailWithResult,
}));
vi.mock('@/lib/server/guardian-facts', () => ({
  loadGuardianPlanFacts: vi.fn(async () => ({
    title: 'Youth plan',
    when: 'Sat, Oct 10, 6:00 PM PDT',
    where: 'Rec center',
    hostName: 'Coach Sam',
    inviteeName: 'Avery',
  })),
}));
vi.mock('@/lib/links', () => ({
  approvalUrl: (token: string) => `/approve/${token}`,
}));
vi.mock('@/lib/server/cascade-runner', () => ({
  advanceEventCascade: mocks.advanceEventCascade,
}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
  reportAndFail: vi.fn(() => ({
    ok: false,
    code: 'SB-RSVP-SAVE',
    error: 'Request failed',
    fix: 'Try again.',
  })),
}));

import {
  requestParentalApproval,
  resendParentalApproval,
  resolveParentalApproval,
} from './parental-approval';

interface InviteRow {
  id: string;
  event_id: string;
  invitee_id: string | null;
  status?: string;
}

interface EventRow {
  id: string;
  title: string;
  parental_approval: boolean;
}

function sessionClient(input: {
  invite: InviteRow | null;
  event?: EventRow | null;
}) {
  const from = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({
        data: table === 'invites' ? input.invite : (input.event ?? null),
        error: null,
      })),
    };
    return builder;
  });
  return { from };
}

/**
 * A service-role stand-in that records writes. `rows` answers reads by table;
 * inserts and updates echo back an id so the action can carry on.
 */
function adminClient(rows: Record<string, unknown>) {
  const writes: Array<{ table: string; kind: 'insert' | 'update'; payload: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    let wrote = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      insert: vi.fn((payload: Record<string, unknown>) => {
        writes.push({ table, kind: 'insert', payload });
        wrote = true;
        return builder;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        writes.push({ table, kind: 'update', payload });
        wrote = true;
        return builder;
      }),
      maybeSingle: vi.fn(async () => ({
        data: wrote ? { id: 'approval-1' } : (rows[table] ?? null),
        error: null,
      })),
    };
    return builder;
  });
  return { from, rpc: mocks.adminRpc, writes };
}

function heldInvitee() {
  const supabase = sessionClient({
    invite: {
      id: 'invite-1',
      event_id: 'event-1',
      invitee_id: 'caller-1',
      status: 'pending_approval',
    },
    event: { id: 'event-1', title: 'Youth plan', parental_approval: true },
  });
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'caller-1' },
    supabase,
  });
  return supabase;
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.sendEmailWithResult.mockResolvedValue({ status: 'sent', provider: 'resend' });
});

describe('parental approval actions', () => {
  it('rejects an invalid guardian address before using the admin client', async () => {
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'caller-1' },
      supabase: {},
    });

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'not-an-email',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Enter a valid email address for the guardian.',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.sendEmailWithResult).not.toHaveBeenCalled();
  });

  it('refuses an invite owned by another user before any service-role access', async () => {
    const supabase = sessionClient({
      invite: {
        id: 'invite-1',
        event_id: 'event-1',
        invitee_id: 'someone-else',
      },
    });
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'caller-1' },
      supabase,
    });

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'guardian@example.com',
    });

    expect(result).toMatchObject({ ok: false, code: 'SB-RSVP-GUARDIAN' });
    expect(supabase.from).toHaveBeenCalledWith('invites');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('refuses an invite/event mismatch even when the invitee id is correct', async () => {
    const supabase = sessionClient({
      invite: {
        id: 'invite-1',
        event_id: 'event-other',
        invitee_id: 'caller-1',
      },
    });
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'caller-1' },
      supabase,
    });

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'guardian@example.com',
    });

    expect(result).toMatchObject({ ok: false, code: 'SB-RSVP-GUARDIAN' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('only asks a guardian about a yes that is actually being held', async () => {
    const supabase = sessionClient({
      invite: {
        id: 'invite-1',
        event_id: 'event-1',
        invitee_id: 'caller-1',
        status: 'declined',
      },
    });
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'caller-1' },
      supabase,
    });

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'guardian@example.com',
    });

    expect(result).toEqual({ ok: false, error: 'This RSVP isn’t waiting on a guardian.' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rate-limits a verified invitee per user before the admin write', async () => {
    const supabase = sessionClient({
      invite: {
        id: 'invite-1',
        event_id: 'event-1',
        invitee_id: 'caller-1',
        status: 'pending_approval',
      },
      event: {
        id: 'event-1',
        title: 'Youth plan',
        parental_approval: true,
      },
    });
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'caller-1' },
      supabase,
    });
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'guardian@example.com',
    });

    expect(result).toMatchObject({ ok: false, code: 'SB-RATE-LIMIT' });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'parental-approval:caller-1',
      5,
      3600,
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rotates the guardian token on resend so the mis-addressed link dies', async () => {
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'host-1' },
      supabase: sessionClient({ invite: null }),
    });
    mocks.checkEventManager.mockResolvedValue({ ok: true, isManager: true });

    const updates: Array<Record<string, unknown>> = [];
    const admin = {
      from: vi.fn((table: string) => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(payload);
            return builder;
          }),
          maybeSingle: vi.fn(async () => ({
            data:
              table === 'parental_approvals'
                ? { id: 'approval-1', token: 'old-token' }
                : { id: 'event-1', title: 'Youth plan', parental_approval: true },
            error: null,
          })),
        };
        return builder;
      }),
    };
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await resendParentalApproval({
      eventId: 'event-1',
      inviteId: 'invite-1',
      guardianEmail: 'guardian@example.com',
      guardianName: 'Guardian',
    });

    expect(result.ok).toBe(true);
    // The rotation, then the record of what happened to the email.
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ email_status: 'sent' });
    const token = updates[0].token;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(token).not.toBe('old-token');
    const sent = JSON.stringify(mocks.sendEmailWithResult.mock.calls);
    expect(sent).toContain(`/approve/${token}`);
    expect(sent).not.toContain('old-token');
  });

  it('creates the first request and tells the guardian who, what, when and where', async () => {
    heldInvitee();
    const admin = adminClient({ parental_approvals: null });
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'Guardian@Example.com',
      guardianName: 'Pat',
    });

    expect(result).toEqual({ ok: true, approvalId: 'approval-1' });
    expect(admin.writes).toEqual([
      expect.objectContaining({
        table: 'parental_approvals',
        kind: 'insert',
        payload: expect.objectContaining({
          invite_id: 'invite-1',
          event_id: 'event-1',
          guardian_email: 'guardian@example.com',
        }),
      }),
      { table: 'parental_approvals', kind: 'update', payload: { email_status: 'sent' } },
    ]);
    const [message] = mocks.sendEmailWithResult.mock.calls[0] as unknown as [
      { to: string; subject: string; text: string },
    ];
    expect(message.to).toBe('guardian@example.com');
    for (const fact of ['Youth plan', 'Sat, Oct 10, 6:00 PM PDT', 'Rec center', 'Coach Sam', 'Avery']) {
      expect(message.text).toContain(fact);
    }
  });

  it('lets the invitee send a pending request again, rotating its link', async () => {
    heldInvitee();
    const admin = adminClient({ parental_approvals: { id: 'approval-1' } });
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'right@example.com',
    });

    expect(result.ok).toBe(true);
    expect(admin.writes).toHaveLength(2);
    expect(admin.writes[0]).toMatchObject({
      kind: 'update',
      payload: { guardian_email: 'right@example.com' },
    });
    expect(admin.writes[0].payload.token).toMatch(/^[0-9a-f]{48}$/);
  });

  it.each([
    ['failed', 'SB-GUARDIAN-EMAIL'],
    ['invalid_recipient', 'SB-GUARDIAN-EMAIL'],
    ['not_configured', 'SB-CONFIG-EMAIL'],
  ])('reports an email that %s honestly, keeping the saved request', async (status, code) => {
    heldInvitee();
    const admin = adminClient({ parental_approvals: null });
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.sendEmailWithResult.mockResolvedValue({ status, provider: 'resend' });

    const result = await requestParentalApproval({
      inviteId: 'invite-1',
      eventId: 'event-1',
      guardianEmail: 'guardian@example.com',
    });

    // "We've emailed the guardian" used to show whatever the provider said.
    expect(result).toMatchObject({ ok: false, code, approvalId: 'approval-1' });
    // And a reload keeps saying so: the outcome is stored on the request.
    expect(admin.writes.at(-1)).toEqual({
      table: 'parental_approvals',
      kind: 'update',
      payload: { email_status: status },
    });
    expect(result.error).toMatch(/saved/);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'parental-approval.email',
      expect.anything(),
      expect.objectContaining({ eventId: 'event-1' }),
      code,
    );
  });

  it('tells a guardian when the plan stopped taking answers', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: { outcome: 'event_closed', event_title: 'Youth plan' },
      error: null,
    });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.adminRpc, from: vi.fn() });

    const result = await resolveParentalApproval('late-token', true);

    expect(result).toMatchObject({ ok: false, outcome: 'event_closed', code: 'SB-RSVP-CLOSED' });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('tells the host and the invitee when a guardian approves', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: { outcome: 'approved', event_title: 'Youth plan', invite_status: 'waitlisted' },
      error: null,
    });
    mocks.createAdminClient.mockReturnValue({
      rpc: mocks.adminRpc,
      from: vi.fn((table: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({
            data:
              table === 'parental_approvals'
                ? { event_id: 'event-1', invite_id: 'invite-1' }
                : table === 'events'
                  ? { host_id: 'host-1' }
                  : { invitee_id: 'kid-1', invitee: { display_name: 'Avery' } },
            error: null,
          }),
        };
        return builder;
      }),
    });

    const result = await resolveParentalApproval('good-token', true);

    expect(result).toMatchObject({ ok: true, outcome: 'approved', inviteStatus: 'waitlisted' });
    expect(mocks.advanceEventCascade).toHaveBeenCalledWith('event-1');
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['host-1'],
      expect.objectContaining({ body: expect.stringContaining('waitlist') }),
    );
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['kid-1'],
      expect.objectContaining({ body: expect.stringContaining('waitlist') }),
    );
    // A waitlisted yes is not a commitment yet, so no Give Space check.
    expect(mocks.adminRpc).not.toHaveBeenCalledWith('note_give_space_overlap_for', expect.anything());
  });

  it('maps an unknown approval token to the stable link error', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: { outcome: 'not_found' },
      error: null,
    });
    mocks.createAdminClient.mockReturnValue({
      rpc: mocks.adminRpc,
      from: vi.fn(() => {
        throw new Error('Unexpected table read');
      }),
    });

    const result = await resolveParentalApproval('unknown-token', true);

    expect(mocks.adminRpc).toHaveBeenCalledWith('resolve_parental_approval', {
      p_token: 'unknown-token',
      p_approve: true,
    });
    expect(result).toMatchObject({
      ok: false,
      outcome: 'not_found',
      code: 'SB-LINK-UNKNOWN',
    });
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it.each([
    ['event_gone', /plan no longer exists/],
    ['invite_gone', /invitation .* withdrawn/],
  ])('tells the guardian a %s link has nothing left to approve', async (outcome, message) => {
    mocks.adminRpc.mockResolvedValue({ data: { outcome }, error: null });
    mocks.createAdminClient.mockReturnValue({
      rpc: mocks.adminRpc,
      from: vi.fn(() => {
        throw new Error('Unexpected table read');
      }),
    });

    const result = await resolveParentalApproval('stale-token', true);

    expect(result).toMatchObject({ ok: false, outcome, code: 'SB-RSVP-GONE' });
    expect(result.error).toMatch(message);
    expect(mocks.advanceEventCascade).not.toHaveBeenCalled();
  });
});
