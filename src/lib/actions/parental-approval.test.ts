import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  checkRateLimit: vi.fn(async () => true),
  checkEventManager: vi.fn(),
  isEventManager: vi.fn(),
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
  looksLikeEmail: (value: string) => value.includes('@'),
  sendEmails: mocks.sendEmails,
}));
vi.mock('@/lib/links', () => ({ approvalUrl: (token: string) => `/approve/${token}` }));
vi.mock('@/lib/server/cascade-runner', () => ({
  advanceEventCascade: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/notify', () => ({
  notifyUsers: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
  reportAndFail: vi.fn(() => ({
    ok: false,
    code: 'SB-RSVP-SAVE',
    error: 'Request failed',
    fix: 'Try again.',
  })),
}));

import { requestParentalApproval } from './parental-approval';

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

describe('requestParentalApproval', () => {
  it('refuses an invite owned by another user before any service-role access', async () => {
    const supabase = sessionClient({
      invite: { id: 'invite-1', event_id: 'event-1', invitee_id: 'someone-else' },
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
    expect(mocks.sendEmails).not.toHaveBeenCalled();
  });

  it('refuses an invite/event mismatch even when the invitee id is correct', async () => {
    const supabase = sessionClient({
      invite: { id: 'invite-1', event_id: 'event-other', invitee_id: 'caller-1' },
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
      invite: { id: 'invite-1', event_id: 'event-1', invitee_id: 'caller-1' },
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
});
