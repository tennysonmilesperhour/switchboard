import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The digest sweep's delivery contract (completion plan G10, decision D16):
 * a digest is marked sent only once it reached a device or an inbox, push
 * falls back to email, and an undelivered one is retried rather than lost.
 */

const mocks = vi.hoisted(() => {
  const state = {
    people: [] as Array<Record<string, unknown>>,
    items: [] as Array<{ kind: string; items: number; latest_title: string | null }>,
    itemsError: null as { message: string } | null,
    email: null as string | null,
  };
  const stamps: string[] = [];
  const pushDigest = vi.fn(async () => 'delivered' as 'delivered' | 'unavailable' | 'failed');
  const sendEmailWithResult = vi.fn(async () => ({ status: 'sent', provider: 'resend' }));
  const emailEnabled = vi.fn(() => true);
  const reportOperationalError = vi.fn(async () => undefined);
  const checkRateLimit = vi.fn(async () => true);
  return {
    state,
    stamps,
    pushDigest,
    sendEmailWithResult,
    emailEnabled,
    reportOperationalError,
    checkRateLimit,
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: async () => ({ data: mocks.state.people, error: null }),
          }),
          update: () => ({
            eq: async (_column: string, id: string) => {
              mocks.stamps.push(id);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'profile_contacts') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          not: () => builder,
          maybeSingle: async () => ({
            data: mocks.state.email ? { normalized_value: mocks.state.email } : null,
            error: null,
          }),
        };
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async () =>
      mocks.state.itemsError
        ? { data: null, error: mocks.state.itemsError }
        : { data: mocks.state.items, error: null },
  }),
}));
vi.mock('@/lib/server/notify', () => ({ pushDigest: mocks.pushDigest }));
vi.mock('@/lib/server/email', () => ({
  emailEnabled: mocks.emailEnabled,
  sendEmailWithResult: mocks.sendEmailWithResult,
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));
vi.mock('@/lib/links', () => ({ absoluteUrl: (path: string) => `https://app.test${path}` }));

import { DIGEST_RETRY_HOURS, isInDigestWindow, sweepDigests } from './digest';

// 08:00 UTC, the person's chosen hour.
const AT_EIGHT = new Date('2026-09-30T08:00:00Z');
const person = {
  id: 'user-1',
  digest_hour: 8,
  digest_sent_at: '2026-09-29T08:00:00Z',
  timezone: 'UTC',
  notify_plans: true,
  notify_suggestions: true,
  notify_reminders: true,
  notify_messages: true,
  notify_social: true,
};

beforeEach(() => {
  mocks.state.people = [{ ...person }];
  mocks.state.items = [{ kind: 'room_message', items: 3, latest_title: 'Hi' }];
  mocks.state.itemsError = null;
  mocks.state.email = null;
  mocks.stamps.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
  mocks.pushDigest.mockResolvedValue('delivered');
  mocks.sendEmailWithResult.mockResolvedValue({ status: 'sent', provider: 'resend' });
  mocks.emailEnabled.mockReturnValue(true);
});

describe('isInDigestWindow', () => {
  it('covers the chosen hour and the retries after it, and nothing else', () => {
    expect(DIGEST_RETRY_HOURS).toBe(3);
    expect(isInDigestWindow(new Date('2026-09-30T08:00:00Z'), 8, 'UTC')).toBe(true);
    expect(isInDigestWindow(new Date('2026-09-30T10:00:00Z'), 8, 'UTC')).toBe(true);
    expect(isInDigestWindow(new Date('2026-09-30T11:00:00Z'), 8, 'UTC')).toBe(false);
    expect(isInDigestWindow(new Date('2026-09-30T07:00:00Z'), 8, 'UTC')).toBe(false);
  });

  it('wraps past midnight and reads the person’s own zone', () => {
    expect(isInDigestWindow(new Date('2026-09-30T01:00:00Z'), 23, 'UTC')).toBe(true);
    // 12:00 UTC is 08:00 in New York (EDT).
    expect(isInDigestWindow(new Date('2026-09-30T12:00:00Z'), 8, 'America/New_York')).toBe(true);
    expect(isInDigestWindow(new Date('2026-09-30T12:00:00Z'), 8, 'Not/AZone')).toBe(false);
  });
});

describe('sweepDigests', () => {
  it('marks a digest sent only after a device took it', async () => {
    const summary = await sweepDigests(AT_EIGHT);
    expect(mocks.pushDigest).toHaveBeenCalledWith('user-1', {
      title: 'Your day on Switchboard',
      body: '3 new messages',
      url: '/notifications',
    });
    expect(mocks.stamps).toEqual(['user-1']);
    expect(summary).toEqual({ sent: 1, emailed: 0, retrying: 0, unreachable: 0 });
  });

  it('falls back to a verified email when push cannot reach anyone', async () => {
    mocks.pushDigest.mockResolvedValue('unavailable');
    mocks.state.email = 'me@example.com';
    const summary = await sweepDigests(AT_EIGHT);
    expect(mocks.sendEmailWithResult).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'me@example.com', subject: 'Your day on Switchboard' }),
    );
    expect(mocks.stamps).toEqual(['user-1']);
    expect(summary.emailed).toBe(1);
  });

  it('leaves a failed digest unsent and logged, so the next sweep retries it', async () => {
    // It used to be stamped before the push and counted whatever happened.
    mocks.pushDigest.mockResolvedValue('failed');
    mocks.state.email = 'me@example.com';
    mocks.sendEmailWithResult.mockResolvedValue({ status: 'failed', provider: 'resend' });
    const summary = await sweepDigests(AT_EIGHT);
    expect(mocks.stamps).toEqual([]);
    expect(summary).toEqual({ sent: 0, emailed: 0, retrying: 1, unreachable: 0 });
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'digest.send',
      expect.any(Error),
      { userId: 'user-1' },
    );

    // An hour later, still inside the window, it goes out.
    mocks.pushDigest.mockResolvedValue('delivered');
    await sweepDigests(new Date('2026-09-30T09:00:00Z'));
    expect(mocks.stamps).toEqual(['user-1']);
  });

  it('does not mark a digest sent for someone with nowhere to receive it', async () => {
    mocks.pushDigest.mockResolvedValue('unavailable');
    const summary = await sweepDigests(AT_EIGHT);
    expect(mocks.stamps).toEqual([]);
    expect(summary.unreachable).toBe(1);
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });

  it('stamps a quiet day without sending anything', async () => {
    mocks.state.items = [];
    await sweepDigests(AT_EIGHT);
    expect(mocks.pushDigest).not.toHaveBeenCalled();
    expect(mocks.stamps).toEqual(['user-1']);
  });

  it('retries when the digest items cannot be read, instead of stamping an empty day', async () => {
    mocks.state.itemsError = { message: 'boom' };
    const summary = await sweepDigests(AT_EIGHT);
    expect(mocks.stamps).toEqual([]);
    expect(summary.retrying).toBe(1);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'digest.items',
      mocks.state.itemsError,
      { userId: 'user-1' },
    );
  });

  it('sends nothing twice in a day', async () => {
    mocks.state.people = [{ ...person, digest_sent_at: '2026-09-30T08:00:00Z' }];
    await sweepDigests(new Date('2026-09-30T09:00:00Z'));
    expect(mocks.pushDigest).not.toHaveBeenCalled();
  });
});
