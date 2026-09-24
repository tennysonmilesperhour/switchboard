import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifyUsers: vi.fn(),
  sendEmails: vi.fn(),
  eventsOr: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/email', () => ({
  sendEmails: mocks.sendEmails,
  guestEmailHeaders: () => ({}),
  looksLikeEmail: (value: string | null) => Boolean(value?.includes('@')),
}));

import { noticeHostedPlansEnding } from './hosted-plans';

const HOST = 'host-1';

function admin(invites: unknown[], cohosts: unknown[]) {
  return {
    from: (table: string) => {
      if (table === 'events') {
        return { select: () => ({ eq: () => ({ in: () => ({ or: mocks.eventsOr }) }) }) };
      }
      if (table === 'invites') {
        return { select: () => ({ in: () => ({ eq: async () => ({ data: invites }) }) }) };
      }
      if (table === 'event_cohosts') {
        return { select: () => ({ in: async () => ({ data: cohosts }) }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventsOr.mockResolvedValue({ data: [{ id: 'e1', title: 'Game night' }], error: null });
});

describe('noticeHostedPlansEnding', () => {
  it('tells accepted guests and co-hosts, never the departing host', async () => {
    const count = await noticeHostedPlansEnding(
      admin(
        [
          { event_id: 'e1', invitee_id: 'guest-1', guest_contact: null },
          { event_id: 'e1', invitee_id: HOST, guest_contact: null },
          { event_id: 'e1', invitee_id: null, guest_contact: 'pat@example.com' },
        ],
        [{ event_id: 'e1', cohost_id: 'cohost-1' }],
      ),
      HOST,
    );

    expect(count).toBe(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['guest-1', 'cohost-1'],
      expect.objectContaining({ kind: 'event_cancelled', url: '/plans' }),
    );
    expect(mocks.sendEmails).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'pat@example.com', subject: 'Cancelled: Game night' }),
    ]);
  });

  it('does nothing when the host has no upcoming plans', async () => {
    mocks.eventsOr.mockResolvedValue({ data: [], error: null });

    const count = await noticeHostedPlansEnding(admin([], []), HOST);

    expect(count).toBe(0);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.sendEmails).not.toHaveBeenCalled();
  });
});
