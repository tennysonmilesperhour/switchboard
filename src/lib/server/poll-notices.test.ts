import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  notifyUsers: vi.fn(),
  sendEmail: vi.fn(),
  sendSms: vi.fn(),
  smsEnabled: vi.fn(),
  consent: vi.fn(),
  slot: vi.fn(),
  report: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/email')>()),
  sendEmailWithResult: mocks.sendEmail,
}));
vi.mock('@/lib/server/sms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/sms')>()),
  sendSmsWithResult: mocks.sendSms,
  smsEnabled: mocks.smsEnabled,
}));
vi.mock('@/lib/server/sms-policy', () => ({ smsConsentAllows: mocks.consent }));
vi.mock('@/lib/server/invite-delivery-limit', () => ({ consumeEventOutboundSlot: mocks.slot }));
vi.mock('@/lib/server/observability', () => ({ reportOperationalError: mocks.report }));

import { notifyPollOpened, notifyPollOutcome, openDecidingPlan } from './poll-notices';

type Result = { data?: unknown; error?: unknown };
type Call = { table: string; steps: Array<[string, ...unknown[]]> };

/** A client whose every query on `table` answers with `tables[table]`. */
function client(tables: Record<string, Result>, calls: Call[]) {
  return (table: string) => {
    const call: Call = { table, steps: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit', 'maybeSingle', 'insert']) {
      builder[method] = (...args: unknown[]) => {
        call.steps.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: Result) => void) =>
      Promise.resolve(tables[table] ?? { data: null, error: null }).then(resolve);
    return builder;
  };
}

const EVENT = {
  id: 'event-1',
  title: 'Board games',
  host_id: 'host-1',
  status: 'deciding',
  starts_at: null,
  time_zone: 'America/New_York',
  share_token: 'tok',
  share_link_active: true,
};
const INVITES = [
  { id: 'inv-member', invitee_id: 'member-1', status: 'queued', guest_name: null, guest_contact: null },
  { id: 'inv-email', invitee_id: null, status: 'queued', guest_name: 'Ana', guest_contact: 'ana@example.com' },
  { id: 'inv-phone', invitee_id: null, status: 'queued', guest_name: 'Ben', guest_contact: '+1 415 555 0100' },
  { id: 'inv-bare', invitee_id: null, status: 'queued', guest_name: 'Cy', guest_contact: null },
];

let adminCalls: Call[];
let sessionCalls: Call[];

function admin(overrides: Record<string, Result> = {}) {
  mocks.from.mockImplementation(
    client(
      {
        events: { data: EVENT },
        event_cohosts: { data: [] },
        invites: { data: INVITES },
        profiles: { data: { display_name: 'Sam' } },
        polls: { data: { topic: 'custom', title: null } },
        invite_delivery_attempts: { error: null },
        ...overrides,
      },
      adminCalls,
    ),
  );
}

function session(tables: Record<string, Result> = {}) {
  return {
    from: client(
      { polls: { data: { id: 'poll-1' } }, poll_options: { error: null }, ...tables },
      sessionCalls,
    ),
  } as unknown as Parameters<typeof openDecidingPlan>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  adminCalls = [];
  sessionCalls = [];
  mocks.notifyUsers.mockResolvedValue({ recorded: true });
  mocks.sendEmail.mockResolvedValue({ status: 'sent', provider: 'resend', providerMessageId: 'em_1' });
  mocks.sendSms.mockResolvedValue({ status: 'sent', provider: 'twilio', providerMessageId: 'SM1' });
  mocks.smsEnabled.mockReturnValue(true);
  mocks.consent.mockResolvedValue(false);
  mocks.slot.mockResolvedValue(true);
});

function attempts() {
  const insert = adminCalls.find((call) => call.table === 'invite_delivery_attempts');
  return insert?.steps.find(([name]) => name === 'insert')?.[1] as Array<Record<string, unknown>> | undefined;
}

describe('openDecidingPlan (decision D4)', () => {
  it('tells account-holders there is a vote and emails guests the share link, once', async () => {
    admin();
    const summary = await openDecidingPlan(session(), 'event-1', 'host-1', undefined);

    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['member-1'], expect.objectContaining({
      kind: 'poll_opened',
      title: 'Help pick the date: Board games',
      url: '/events/event-1',
    }));

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const email = mocks.sendEmail.mock.calls[0][0];
    expect(email.to).toBe('ana@example.com');
    expect(email.subject).toBe('Help pick the date: Board games');
    expect(email.text).toMatch(/\/i\/tok/);
    expect(email.headers).toHaveProperty('List-Unsubscribe');

    // A phone the host typed is not consent: no text, and the wizard hears the
    // link is theirs to share. A guest with no contact at all, likewise.
    expect(mocks.sendSms).not.toHaveBeenCalled();
    expect(summary).toEqual({
      sent: 2, notConfigured: 0, failed: 0, invalidRecipient: 0, optedOut: 0, manual: 2,
    });
    expect(attempts()).toEqual([expect.objectContaining({
      invite_id: 'inv-email', channel: 'email', status: 'sent', provider_message_id: 'em_1',
    })]);
    expect(mocks.slot).toHaveBeenCalledWith('host-1', 'invitation');
  });

  it('texts a guest only where the consent rules allow it', async () => {
    admin();
    mocks.consent.mockResolvedValue(true);
    await openDecidingPlan(session(), 'event-1', 'host-1', undefined);
    expect(mocks.consent).toHaveBeenCalledWith('+14155550100', 'plans', undefined, 'inv-phone');
    expect(mocks.sendSms).toHaveBeenCalledWith(expect.objectContaining({
      to: '+14155550100', category: 'plans', guestInviteId: 'inv-phone',
    }));
    expect(mocks.sendSms.mock.calls[0][0].body).toMatch(/help pick the date/);
  });

  it('hands out no link the recipient page would refuse', async () => {
    admin({ events: { data: { ...EVENT, share_link_active: false } } });
    const summary = await openDecidingPlan(session(), 'event-1', 'host-1', undefined);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(summary.manual).toBe(3);
    // Account-holders are still told in the app; that needs no link.
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
  });

  it('records the host’s daily sending limit as a failed attempt', async () => {
    admin();
    mocks.slot.mockResolvedValue(false);
    const summary = await openDecidingPlan(session(), 'event-1', 'host-1', undefined);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
    expect(attempts()).toEqual([expect.objectContaining({ channel: 'email', error_code: 'host_daily_limit' })]);
  });

  it('re-checks that the caller is the plan’s host before sending anything', async () => {
    admin();
    await openDecidingPlan(session(), 'event-1', 'someone-else', undefined);
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('puts the ideas the host floated on the first poll, through the host’s own session', async () => {
    admin();
    await openDecidingPlan(session(), 'event-1', 'host-1', ['Pizza', 'pizza!', '  ', 'Bowling']);
    const insert = sessionCalls.find((call) => call.table === 'poll_options');
    expect(insert?.steps).toContainEqual(['insert', [
      { poll_id: 'poll-1', label: 'Pizza', link_url: null, author_id: 'host-1', source: 'host' },
      { poll_id: 'poll-1', label: 'Bowling', link_url: null, author_id: 'host-1', source: 'host' },
    ]]);
    const pollRead = sessionCalls.find((call) => call.table === 'polls');
    expect(pollRead?.steps).toContainEqual(['is', 'parent_poll_id', null]);
  });

  it('logs ideas that did not land and still announces the plan', async () => {
    admin();
    const failure = { message: 'denied', code: '42501' };
    await openDecidingPlan(session({ poll_options: { error: failure } }), 'event-1', 'host-1', ['Pizza']);
    expect(mocks.report).toHaveBeenCalledWith('poll.seed', failure, { eventId: 'event-1', ideas: 1 });
    expect(mocks.notifyUsers).toHaveBeenCalled();
  });
});

describe('notifyPollOpened', () => {
  it('reaches queued voters and co-hosts on a deciding plan', async () => {
    admin({
      polls: { data: { id: 'poll-2', event_id: 'event-1', topic: 'place', title: null } },
      event_cohosts: { data: [{ cohost_id: 'cohost-1' }] },
      invites: {
        data: [
          ...INVITES,
          { id: 'inv-yes', invitee_id: 'yes-1', status: 'accepted', guest_name: null, guest_contact: null },
          { id: 'inv-no', invitee_id: 'no-1', status: 'declined', guest_name: null, guest_contact: null },
        ],
      },
    });
    await notifyPollOpened('poll-2', 'follow-up');
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['host-1', 'cohost-1', 'member-1', 'yes-1'],
      expect.objectContaining({ kind: 'poll_opened', title: "That's settled — now: Where should we go?" }),
    );
  });

  it('never throws; a failed read is logged', async () => {
    const failure = { message: 'down' };
    admin({ polls: { data: { id: 'poll-2', event_id: 'event-1', topic: 'place', title: null } }, events: { error: failure } });
    await expect(notifyPollOpened('poll-2', 'runoff')).resolves.toBeUndefined();
    expect(mocks.report).toHaveBeenCalledWith('poll.notify', failure, { pollId: 'poll-2', reason: 'runoff' });
  });
});

describe('notifyPollOutcome', () => {
  it('tells the group the result and the hosts what is next, but not whoever closed it', async () => {
    admin({
      events: { data: { ...EVENT, starts_at: '2026-10-02T22:00:00Z' } },
      event_cohosts: { data: [{ cohost_id: 'cohost-1' }] },
      polls: { data: { id: 'poll-1', event_id: 'event-1', topic: 'date', title: null, winning_option_id: 'opt-1' } },
      poll_options: { data: [{ id: 'opt-1', label: '2026-10-02T17:00:00.000Z' }, { id: 'opt-2', label: 'Sunday' }] },
    });
    await notifyPollOutcome('poll-1', {
      date: { kind: 'set', startsAt: '2026-10-02T22:00:00.000Z', timeZone: 'America/New_York' },
      actorId: 'host-1',
    });
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(2);
    const [guestCall, managerCall] = mocks.notifyUsers.mock.calls;
    expect(guestCall[0]).toEqual(['member-1']);
    expect(guestCall[1]).toMatchObject({
      kind: 'event_date_set',
      title: 'It’s decided: Friday, October 2 · evening',
    });
    expect(guestCall[1].body).toMatch(/6:00 PM/);
    expect(managerCall[0]).toEqual(['cohost-1']);
    expect(managerCall[1].body).toMatch(/Send the invitations/);
  });

  it('tells the host it is their pick when the deadline closes a poll with no winner', async () => {
    admin({
      polls: { data: { id: 'poll-1', event_id: 'event-1', topic: 'date', title: null, winning_option_id: null } },
      poll_options: { data: [{ id: 'opt-1', label: 'Friday' }, { id: 'opt-2', label: 'Sunday' }] },
    });
    await notifyPollOutcome('poll-1', { date: { kind: 'none' } });
    const managerCall = mocks.notifyUsers.mock.calls.find(([ids]) => ids.includes('host-1'));
    expect(managerCall?.[1].title).toBe('Your pick: When should this be?');
  });
});
