import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  notifyUsers: vi.fn(async () => ({ recorded: true })),
  report: vi.fn(async () => undefined),
  owner: { data: { display_name: 'Sam' } },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => mocks.owner }) }),
    }),
  }),
}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({ reportOperationalError: mocks.report }));

import { nearbyNotice, notifyNearbyFriends } from './signal-nearby';

const OWNER = '11111111-1111-4111-8111-111111111111';
const signals = [{ id: 'sig-1', label: 'Coffee Break' }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner = { data: { display_name: 'Sam' } };
});

describe('nearbyNotice', () => {
  it('names the person and the status, and nothing about where anyone is', () => {
    const notice = nearbyNotice('Sam', signals, OWNER);
    expect(notice.title).toBe('Sam is nearby');
    expect(notice.body).toBe('Coffee Break. Tap to say hi.');
    expect(notice.url).toBe(`/rooms/with/${OWNER}`);
    expect(JSON.stringify(notice)).not.toMatch(/\bkm\b|metres|meters|miles|\d+ ?m\b/i);
  });

  it('keeps a long list short', () => {
    const many = ['A', 'B', 'C', 'D'].map((label, i) => ({ id: String(i), label }));
    expect(nearbyNotice('Sam', many, OWNER).body).toBe('A · B +2. Tap to say hi.');
  });
});

describe('notifyNearbyFriends', () => {
  it('notifies exactly the recipients the database claimed', async () => {
    mocks.rpc.mockResolvedValue({ data: ['r1', 'r2'], error: null });

    expect(await notifyNearbyFriends(OWNER, signals)).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'claim_signal_nearby_recipients',
      expect.objectContaining({ p_owner: OWNER, p_signal_ids: ['sig-1'] }),
    );
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['r1', 'r2'],
      expect.objectContaining({ kind: 'signal_nearby', title: 'Sam is nearby' }),
    );
  });

  it('sends nothing when nobody qualifies', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await notifyNearbyFriends(OWNER, signals)).toBe(0);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('logs and swallows a database failure instead of throwing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await notifyNearbyFriends(OWNER, signals)).toBe(0);
    expect(mocks.report).toHaveBeenCalledWith(
      'signal.notify-nearby',
      expect.anything(),
      expect.anything(),
      'SB-SIGNAL-NOTIFY',
    );
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('does nothing without a status to announce', async () => {
    expect(await notifyNearbyFriends(OWNER, [])).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
