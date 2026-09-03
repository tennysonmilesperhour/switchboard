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
  sendEmails: vi.fn(async () => undefined),
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
  sendEmails: mocks.sendEmails,
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

afterEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue(true);
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
    expect(mocks.sendEmails).not.toHaveBeenCalled();
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

  it('rate-limits a verified invitee per user before the admin write', async () => {
    const supabase = sessionClient({
      invite: {
        id: 'invite-1',
        event_id: 'event-1',
        invitee_id: 'caller-1',
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
    expect(updates).toHaveLength(1);
    const token = updates[0].token;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(token).not.toBe('old-token');
    const sent = JSON.stringify(mocks.sendEmails.mock.calls);
    expect(sent).toContain(`/approve/${token}`);
    expect(sent).not.toContain('old-token');
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
});
