import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  checkRateLimit: vi.fn(async () => true),
  notifyUsers: vi.fn(async () => ({ recorded: true })),
  sendEmail: vi.fn(async () => true),
  insert: vi.fn(async () => ({ error: null })),
  pendingCount: vi.fn(async () => ({ count: 0, error: null })),
  rpc: vi.fn(async () => ({ error: null })),
  adminVenue: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
    from: () => {
      const node: Record<string, unknown> = {};
      node.select = () => node;
      node.eq = () => node;
      node.not = () => node;
      node.limit = () => node;
      node.maybeSingle = mocks.adminVenue;
      return node;
    },
  }),
}));

import { claimVenue, reviewVenue } from './venues';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboardsocial.me');
  vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'help@example.com');
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.pendingCount.mockResolvedValue({ count: 0, error: null });
  const venues = {
    select: () => {
      const node: Record<string, unknown> = {};
      node.eq = () => node;
      node.then = (resolve: (value: unknown) => unknown) => mocks.pendingCount().then(resolve);
      return node;
    },
    insert: mocks.insert,
  };
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'moderator' },
    supabase: { from: () => venues, rpc: mocks.rpc },
  });
});

describe('claiming a venue', () => {
  it('files a pending claim with a normalised link', async () => {
    expect(await claimVenue(' Corner Cafe ', 'Downtown', '10% off', 'cornercafe.example')).toEqual({
      ok: true,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Corner Cafe', url: 'https://cornercafe.example/' }),
    );
  });

  it('is rate-limited', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    expect(await claimVenue('Corner Cafe', '', '10% off', '')).toMatchObject({
      ok: false,
      code: 'SB-RATE-LIMIT',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('caps how many can wait for review at once', async () => {
    mocks.pendingCount.mockResolvedValue({ count: 3, error: null });
    const result = await claimVenue('Corner Cafe', '', '10% off', '');
    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('refuses a link that is not a web address', async () => {
    const result = await claimVenue('Corner Cafe', '', '10% off', 'javascript:alert(1)');
    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('reviewing a claim (D14)', () => {
  function decided(status: 'verified' | 'rejected', note: string | null) {
    mocks.adminVenue.mockResolvedValueOnce({
      data: {
        name: 'Corner Cafe',
        status,
        review_note: note,
        claimed_by: 'claimant',
        reviewed_by: 'moderator',
        reviewed_at: new Date().toISOString(),
      },
      error: null,
    });
  }

  it('tells the claimant, with the reviewer’s note, in the app and by email with a way to appeal', async () => {
    decided('rejected', 'We could not find this business online.');
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: 'owner@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' } },
    });

    expect(await reviewVenue('venue-1', 'rejected', 'We could not find this business online.')).toEqual({
      ok: true,
    });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['claimant'],
      expect.objectContaining({ kind: 'venue_review', body: expect.stringContaining('could not find') }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        text: expect.stringContaining('reply to this email to appeal'),
        replyTo: 'help@example.com',
      }),
    );
  });

  it('says nothing when this reviewer did not just decide it (a double review)', async () => {
    mocks.adminVenue.mockResolvedValueOnce({
      data: {
        name: 'Corner Cafe',
        status: 'verified',
        review_note: null,
        claimed_by: 'claimant',
        reviewed_by: 'someone-else',
        reviewed_at: new Date().toISOString(),
      },
      error: null,
    });
    await reviewVenue('venue-1', 'verified', '');
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
