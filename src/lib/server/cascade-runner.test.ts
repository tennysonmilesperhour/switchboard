import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  advanceCascade: vi.fn(),
  notifyUsers: vi.fn(),
  report: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/engine/cascade', () => ({ advanceCascade: mocks.advanceCascade }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', () => ({ reportOperationalError: mocks.report }));

import { advanceEventCascade } from './cascade-runner';

const EVENT = { id: 'event-1', status: 'inviting', invite_mode: 'individual', capacity: null, title: 'Dinner' };
const INVITES = [
  { id: 'inv-1', event_id: 'event-1', invitee_id: 'user-1', status: 'sent', position: 0, group_stage: 0 },
  { id: 'inv-2', event_id: 'event-1', invitee_id: 'user-2', status: 'queued', position: 1, group_stage: 1 },
];

function table(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'single', 'maybeSingle', 'insert']) builder[method] = () => builder;
  builder.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((name: string) =>
    table(name === 'events' ? { data: EVENT } : name === 'invites' ? { data: INVITES } : { data: null }),
  );
  mocks.advanceCascade.mockReturnValue([
    { id: 'inv-1', status: 'expired' },
    { id: 'inv-2', status: 'sent', sentAt: '2026-09-30T12:00:00.000Z' },
  ]);
});

describe('advanceEventCascade (G18)', () => {
  it('logs a failed atomic apply with its code and sends nothing, so the next tick retries', async () => {
    const failure = { message: 'deadlock detected', code: '40P01' };
    mocks.rpc.mockResolvedValue({ data: null, error: failure });

    const summary = await advanceEventCascade('event-1');

    expect(mocks.report).toHaveBeenCalledWith('cascade.apply', failure, {
      eventId: 'event-1',
      transitions: 2,
    });
    // Nothing was applied, so nobody may be told they are invited.
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(summary).toEqual({
      sent: 0, notConfigured: 0, failed: 0, invalidRecipient: 0, optedOut: 0, manual: 0,
    });
  });

  it('delivers exactly the invites the apply sent', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ sent_id: 'inv-2' }], error: null });
    mocks.notifyUsers.mockResolvedValue({ recorded: true });

    const summary = await advanceEventCascade('event-1');

    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers.mock.calls[0][0]).toEqual(['user-2']);
    expect(summary.sent).toBe(1);
  });
});
