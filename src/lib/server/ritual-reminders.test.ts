import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  notifyUsers: vi.fn(),
  report: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({ reportOperationalError: mocks.report }));

import { RITUAL_REMINDER_BATCH, sweepRitualReminders } from './ritual-reminders';

const CLAIMED = [
  {
    ritual_id: 'ritual-1',
    due_on: '2026-09-29',
    user_id: 'rita',
    other_id: 'pat',
    activity: 'Coffee',
    other_name: 'Pat',
  },
  {
    ritual_id: 'ritual-1',
    due_on: '2026-09-29',
    user_id: 'pat',
    other_id: 'rita',
    activity: 'Coffee',
    other_name: 'Rita',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyUsers.mockResolvedValue({ recorded: true });
});

describe('sweepRitualReminders (D8)', () => {
  it('tells each claimed person, naming the other, as a social notification', async () => {
    mocks.rpc.mockResolvedValue({ data: CLAIMED, error: null });

    const sent = await sweepRitualReminders();

    expect(mocks.rpc).toHaveBeenCalledWith('claim_ritual_reminders', {
      p_limit: RITUAL_REMINDER_BATCH,
    });
    expect(sent).toBe(2);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(2);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['rita'], {
      kind: 'ritual',
      title: 'A ritual is due 🔁',
      body: 'Time for coffee with Pat. Plan it, or skip this one.',
      url: '/mutual',
    });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['pat'],
      expect.objectContaining({ kind: 'ritual', body: expect.stringContaining('with Rita') }),
    );
  });

  it('sends nothing when the claim hands back nobody (already reminded, held, or not due)', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    expect(await sweepRitualReminders()).toBe(0);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('logs a failed claim with its code and sends nothing, so the next tick retries', async () => {
    const failure = { message: 'connection reset' };
    mocks.rpc.mockResolvedValue({ data: null, error: failure });

    expect(await sweepRitualReminders()).toBe(0);
    expect(mocks.report).toHaveBeenCalledWith('ritual.remind', failure, { stage: 'claim' });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('counts only reminders that reached the inbox', async () => {
    mocks.rpc.mockResolvedValue({ data: CLAIMED, error: null });
    mocks.notifyUsers.mockResolvedValueOnce({ recorded: false });

    expect(await sweepRitualReminders()).toBe(1);
  });
});
