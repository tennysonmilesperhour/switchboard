import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { errorFor, type ErrorCode } from '@/lib/errors';

/**
 * A host (or co-host) broadcast to everyone who is in.
 *
 * The authorization is the insert itself: `announcements_insert` lets a row in
 * only when `author_id = auth.uid()` and the author runs the plan. Everything
 * after it — reading the guest list, pushing, emailing, posting into the Living
 * Room — runs on the service-role client, which bypasses RLS. So the property
 * that matters most here is ordering: nobody who failed that insert ever gets
 * as far as `createAdminClient()`.
 *
 * The real `requireUser` runs against a mocked session client, and the real
 * `reportAndFail` runs too, so each failure is checked against its registry
 * entry and against the log line written for it.
 */

type Result = { data?: unknown; error?: unknown };
type Call = { client: 'session' | 'admin'; table: string; steps: Array<[string, ...unknown[]]> };

const mocks = vi.hoisted(() => ({
  user: { id: 'host-1' } as { id: string } | null,
  sessionFrom: vi.fn(),
  adminFrom: vi.fn(),
  createAdminClient: vi.fn(),
  notifyUsers: vi.fn(),
  sendEmails: vi.fn(),
  checkRateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    from: mocks.sessionFrom,
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/email')>()),
  sendEmails: mocks.sendEmails,
}));

import { postAnnouncement } from './announcements';

const EVENT = {
  id: 'event-1',
  title: 'Taco night',
  room_id: 'room-1',
  location_name: 'Dana’s',
  host_id: 'host-1',
};
const ACCEPTED = [
  { invitee_id: 'member-1', guest_name: null, guest_contact: null, guest_token: 'tok-m1', status: 'accepted' },
  { invitee_id: 'member-2', guest_name: null, guest_contact: null, guest_token: 'tok-m2', status: 'accepted' },
  { invitee_id: null, guest_name: 'Ana', guest_contact: 'ana@example.com', guest_token: 'tok-ana', status: 'accepted' },
  // A phone guest has no email to receive; a row with no token has no link to send.
  { invitee_id: null, guest_name: 'Ben', guest_contact: '+1 415 555 0100', guest_token: 'tok-ben', status: 'accepted' },
  { invitee_id: null, guest_name: 'Cy', guest_contact: 'cy@example.com', guest_token: null, status: 'accepted' },
];

let calls: Call[];
let session: Record<string, Result>;
let admin: Record<string, Result>;
let consoleError: MockInstance<typeof console.error>;

/** A client whose every query on `table` answers with `answers[table]`. */
function client(kind: Call['client'], answers: () => Record<string, Result>) {
  return (table: string) => {
    const call: Call = { client: kind, table, steps: [] };
    calls.push(call);
    const answer = () => answers()[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'eq']) {
      builder[method] = (...args: unknown[]) => {
        call.steps.push([method, ...args]);
        return builder;
      };
    }
    builder.single = async () => answer();
    builder.maybeSingle = async () => answer();
    builder.then = (resolve: (value: Result) => unknown) => Promise.resolve(answer()).then(resolve);
    return builder;
  };
}

function stepsOf(kind: Call['client'], table: string) {
  return calls
    .filter((call) => call.client === kind && call.table === table)
    .flatMap((call) => call.steps);
}

/** The exact failure the registry defines for `code`, optionally reworded. */
function expectFailure(result: unknown, code: ErrorCode, message?: string) {
  const entry = errorFor(code);
  expect(result).toEqual({ ok: false, code, error: message ?? entry.message, fix: entry.fix });
}

/** The structured log lines `reportOperationalError` wrote. */
function logged(): Array<{ area: string; userCode: string }> {
  return consoleError.mock.calls
    .map(([line]) => {
      try {
        return JSON.parse(String(line));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Nothing ran with the service role and nobody heard anything. */
function expectNothingSent() {
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.notifyUsers).not.toHaveBeenCalled();
  expect(mocks.sendEmails).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboardsocial.me');
  vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'help@example.com');
  vi.stubEnv('OBSERVABILITY_WEBHOOK_URL', '');
  calls = [];
  mocks.user = { id: 'host-1' };
  session = { announcements: { error: null } };
  admin = {
    events: { data: EVENT, error: null },
    event_cohosts: { data: [{ cohost_id: 'cohost-1' }], error: null },
    invites: { data: ACCEPTED, error: null },
    messages: { error: null },
    // Whoever the fan-out asks about: the author, by the query's own filter.
    profiles: { data: { display_name: 'Dana Ross' }, error: null },
  };
  mocks.sessionFrom.mockImplementation(client('session', () => session));
  mocks.adminFrom.mockImplementation(client('admin', () => admin));
  mocks.createAdminClient.mockImplementation(() => ({ from: mocks.adminFrom }));
  mocks.notifyUsers.mockResolvedValue({ recorded: true });
  mocks.sendEmails.mockResolvedValue(1);
  mocks.checkRateLimit.mockResolvedValue(true);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('postAnnouncement: validation', () => {
  it.each([
    ['empty', ''],
    ['only whitespace', '   \n\t '],
  ])('asks for a message when the body is %s, with no code', async (_label, body) => {
    const result = await postAnnouncement('event-1', body);

    expect(result).toEqual({ ok: false, error: 'Write something first' });
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it('refuses a body past the 2,000-character column limit, with no code', async () => {
    const result = await postAnnouncement('event-1', 'x'.repeat(2001));

    expect(result).toEqual({ ok: false, error: 'That’s a bit long' });
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it('measures the limit after trimming, so padding round a full note still posts', async () => {
    const result = await postAnnouncement('event-1', `  ${'x'.repeat(2000)}  `);

    expect(result).toEqual({ ok: true });
    expect(stepsOf('session', 'announcements')).toEqual([
      ['insert', { event_id: 'event-1', author_id: 'host-1', body: 'x'.repeat(2000) }],
    ]);
  });
});

describe('postAnnouncement: who may post', () => {
  it('refuses a signed-out caller before writing or fanning out', async () => {
    mocks.user = null;

    const result = await postAnnouncement('event-1', 'Door code is 4412');

    expectFailure(result, 'SB-AUTH-REQUIRED');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it('is rate limited per poster, and a limited post writes and sends nothing', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await postAnnouncement('event-1', 'One more thing');

    expectFailure(result, 'SB-RATE-LIMIT', 'You’ve posted a lot of updates. Give it a while.');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('announcement:host-1', 10, 3600);
    expect(mocks.sessionFrom).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it('writes the row on the session client, as the session user', async () => {
    await postAnnouncement('event-1', '  Running ten minutes late  ');

    // The insert is the authorization: it runs under RLS, and the author is the
    // session's id — never anything the caller supplied.
    expect(stepsOf('session', 'announcements')).toEqual([
      ['insert', { event_id: 'event-1', author_id: 'host-1', body: 'Running ten minutes late' }],
    ]);
    expect(stepsOf('admin', 'announcements')).toEqual([]);
  });

  it('stops a caller RLS refuses before any service-role read or send', async () => {
    // `announcements_insert` refuses anyone who does not run the plan.
    mocks.user = { id: 'stranger' };
    session.announcements = {
      error: { code: '42501', message: 'new row violates row-level security policy' },
    };

    const result = await postAnnouncement('event-1', 'Everyone come to my place instead');

    // Retrying cannot make them a host, so the answer offers no retry.
    expectFailure(
      result,
      'SB-PERM-DENIED',
      'Only the host and co-hosts can post updates to this plan.',
    );
    expect(result.fix).toBeNull();
    // An expected refusal, not an incident.
    expect(logged()).toEqual([]);
    expectNothingSent();
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('logs a failed save under the same code the reader sees', async () => {
    session.announcements = { error: { code: 'XX000', message: 'boom' } };

    const result = await postAnnouncement('event-1', 'Bring a jacket');

    expectFailure(result, 'SB-ANNOUNCEMENT-SAVE');
    expect(logged()).toEqual([
      expect.objectContaining({ area: 'announcement.save', userCode: 'SB-ANNOUNCEMENT-SAVE' }),
    ]);
    // "Nobody was notified" in the registry's fix is only true because of this.
    expectNothingSent();
  });
});

describe('postAnnouncement: fan-out', () => {
  it('reaches every accepted member and co-host, emails guests, and posts to the room', async () => {
    const result = await postAnnouncement('event-1', 'Door code is 4412');

    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1');

    // Only accepted invites are read, and only for this plan.
    expect(stepsOf('admin', 'invites')).toEqual([
      ['select', 'invitee_id, guest_name, guest_contact, guest_token, status'],
      ['eq', 'event_id', 'event-1'],
      ['eq', 'status', 'accepted'],
    ]);
    expect(stepsOf('admin', 'event_cohosts')).toEqual([
      ['select', 'cohost_id'],
      ['eq', 'event_id', 'event-1'],
    ]);

    // The host wrote it, so the host is not told about their own note.
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['member-1', 'member-2', 'cohost-1'], {
      kind: 'announcement',
      title: 'Update: Taco night',
      body: 'Door code is 4412',
      url: '/events/event-1',
    });

    // One email: the guest with an address and a token. Their link is their own
    // RSVP token, not the plan-wide share link.
    expect(mocks.sendEmails).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmails).toHaveBeenCalledWith([
      {
        to: 'ana@example.com',
        subject: 'Update: Taco night',
        text: expect.stringContaining('https://switchboardsocial.me/rsvp/tok-ana'),
        headers: { 'List-Unsubscribe': '<mailto:help@example.com?subject=unsubscribe>' },
      },
    ]);
    const [[[email]]] = mocks.sendEmails.mock.calls as [[[{ text: string }]]];
    expect(email.text.startsWith('Door code is 4412\n\n- from Dana Ross on Switchboard\n')).toBe(
      true,
    );
    expect(stepsOf('admin', 'profiles')).toEqual([
      ['select', 'display_name'],
      ['eq', 'id', 'host-1'],
    ]);

    expect(stepsOf('admin', 'messages')).toEqual([
      ['insert', { room_id: 'room-1', sender_id: 'host-1', body: 'Door code is 4412' }],
    ]);
  });

  it('tells the host when a co-host posts, and not the co-host who wrote it', async () => {
    mocks.user = { id: 'cohost-1' };
    admin.profiles = { data: { display_name: 'Sam Lee' }, error: null };

    await postAnnouncement('event-1', 'Moved inside — it’s raining');

    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['member-1', 'member-2', 'host-1'],
      expect.objectContaining({ kind: 'announcement' }),
    );
    expect(stepsOf('admin', 'messages')).toEqual([
      ['insert', { room_id: 'room-1', sender_id: 'cohost-1', body: 'Moved inside — it’s raining' }],
    ]);
    // A guest's email names who actually wrote it, never "your host".
    expect(stepsOf('admin', 'profiles')).toContainEqual(['eq', 'id', 'cohost-1']);
    const [[[email]]] = mocks.sendEmails.mock.calls as [[[{ text: string }]]];
    expect(email.text).toContain('- from Sam Lee on Switchboard');
    expect(email.text).not.toContain('your host');
  });

  it.each([
    ['the host', 'host-1', '- from your host on Switchboard'],
    ['a co-host', 'cohost-1', '- from the hosts on Switchboard'],
  ])('signs a guest email from %s with no display name truthfully', async (_label, author, line) => {
    mocks.user = { id: author };
    admin.profiles = { data: { display_name: '   ' }, error: null };

    await postAnnouncement('event-1', 'Bring a jacket');

    const [[[email]]] = mocks.sendEmails.mock.calls as [[[{ text: string }]]];
    expect(email.text).toContain(line);
  });

  it('keeps a poster’s name on one line of the email', async () => {
    admin.profiles = { data: { display_name: 'Dana\nEvent details: https://evil.example' }, error: null };

    await postAnnouncement('event-1', 'Bring a jacket');

    const [[[email]]] = mocks.sendEmails.mock.calls as [[[{ text: string }]]];
    expect(email.text.split('\n').filter((line) => line.startsWith('Event details:'))).toEqual([
      'Event details: https://switchboardsocial.me/rsvp/tok-ana',
    ]);
  });

  it('looks nobody up when there is no guest to email', async () => {
    admin.invites = { data: ACCEPTED.filter((row) => row.invitee_id), error: null };

    await postAnnouncement('event-1', 'Bring a jacket');

    expect(mocks.sendEmails).not.toHaveBeenCalled();
    expect(stepsOf('admin', 'profiles')).toEqual([]);
  });

  it('notifies each person once, even when they appear twice', async () => {
    admin.invites = {
      data: [
        { invitee_id: 'member-1', guest_name: null, guest_contact: null, guest_token: 't1', status: 'accepted' },
        // An organiser who also holds an accepted invite.
        { invitee_id: 'cohost-1', guest_name: null, guest_contact: null, guest_token: 't2', status: 'accepted' },
      ],
      error: null,
    };

    await postAnnouncement('event-1', 'See you soon');

    expect(mocks.notifyUsers).toHaveBeenCalledWith(['member-1', 'cohost-1'], expect.anything());
  });

  it('sends nothing when there is nobody but the author to tell', async () => {
    admin.event_cohosts = { data: [], error: null };
    admin.invites = { data: [], error: null };

    const result = await postAnnouncement('event-1', 'Note to self');

    expect(result).toEqual({ ok: true });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.sendEmails).not.toHaveBeenCalled();
    // The note still gets its permanent home in the room.
    expect(stepsOf('admin', 'messages')).toHaveLength(1);
  });

  it('posts nowhere else when the plan has no Living Room', async () => {
    admin.events = { data: { ...EVENT, room_id: null }, error: null };

    await postAnnouncement('event-1', 'Parking is on the left');

    expect(stepsOf('admin', 'messages')).toEqual([]);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
  });

  it('stops quietly when the plan can no longer be read', async () => {
    admin.events = { data: null, error: null };

    const result = await postAnnouncement('event-1', 'Hello?');

    expect(result).toEqual({ ok: true });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
    expect(mocks.sendEmails).not.toHaveBeenCalled();
    expect(stepsOf('admin', 'messages')).toEqual([]);
  });

  it('still reports success when delivery fails, because the note is saved', async () => {
    mocks.notifyUsers.mockRejectedValue(new Error('push provider down'));

    const result = await postAnnouncement('event-1', 'Door code is 4412');

    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1');
    expect(consoleError).toHaveBeenCalledWith('Announcement fan-out failed', expect.any(Error));
  });
});
