import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { busyBandsFromStored } from '@/lib/availability';
import {
  HOST,
  PLAN_ID,
  SENT,
  YES,
  asUser,
  db,
  queriesOn,
  restoreDefaults,
  rpcCallsTo,
  seedPlan,
} from './event-page.fake';

/**
 * The plan page loader, by what the plan holds: its polls and whether the
 * invitations may go, the calendar overlay on a date still being chosen, the
 * zone the page reads in, RSVP answers, the thread, and the facts every viewer
 * shares. Who may load which parts is in `event-page.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  getRelationship: vi.fn(),
  getMutualConnections: vi.fn(),
  loadAvailability: vi.fn(),
  signMediaRef: vi.fn(),
}));

vi.mock('@/lib/supabase/server', async () => {
  const fake = await import('./event-page.fake');
  return { createClient: async () => fake.session };
});
vi.mock('@/lib/supabase/admin', async () => {
  const fake = await import('./event-page.fake');
  return { createAdminClient: fake.clients.createAdminClient };
});
vi.mock('@/lib/server/relationship', () => ({
  getRelationship: mocks.getRelationship,
  getMutualConnections: mocks.getMutualConnections,
}));
vi.mock('@/lib/actions/availability', () => ({ loadAvailability: mocks.loadAvailability }));
vi.mock('@/lib/server/media', () => ({ signMediaRef: mocks.signMediaRef }));

import { EVENT_PAGE_UNAVAILABLE, loadEventPage, threadExcerpt } from './event-page';

async function load(viewer: string) {
  const page = await loadEventPage(PLAN_ID, asUser(viewer));
  if (!page || page === EVENT_PAGE_UNAVAILABLE) throw new Error(`expected ${viewer} to load the plan`);
  return page;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboard.test');
  restoreDefaults();
  seedPlan();
  mocks.getRelationship.mockReset().mockResolvedValue({ status: 'connected' });
  mocks.getMutualConnections.mockReset().mockResolvedValue([]);
  mocks.loadAvailability.mockReset().mockResolvedValue({ counts: [{ slot: '2026-10-06T17:00:00.000Z', people: 2 }], responders: 2, eligiblePeople: 4 });
  mocks.signMediaRef.mockReset().mockImplementation(async (ref: string | null) => (ref ? `https://media.test/${ref}` : null));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('polls and whether the invitations may go', () => {
  const poll = (id: string, phase: string, created_at: string, patch: Record<string, unknown> = {}) => ({
    id,
    event_id: PLAN_ID,
    phase,
    topic: 'custom',
    winning_option_id: null,
    created_at,
    ...patch,
  });

  beforeEach(() => {
    seedPlan({ status: 'deciding', starts_at: null });
    db.tables.poll_options = [
      { id: 'o-fri', poll_id: 'p-date', label: 'Fri evening' },
      { id: 'o-sat', poll_id: 'p-time', label: 'Sat 7pm' },
      { id: 'o-beach', poll_id: 'p-where', label: 'Beach' },
      { id: 'o-park', poll_id: 'p-where', label: 'Park' },
    ];
    db.tables.poll_votes = [
      { poll_id: 'p-where', voter_id: YES, option_id: 'o-beach', weight: 2 },
      { poll_id: 'p-where', voter_id: SENT, option_id: 'o-park', weight: 1 },
    ];
    db.rpc.poll_results = (args) => (args.p_poll === 'p-where' ? [{ option_id: 'o-beach', score: 2 }] : []);
  });

  it('puts the open poll in front, holds the invitations back, and loads only the viewer’s votes', async () => {
    db.tables.polls = [
      poll('p-food', 'pending', '2026-09-03T00:00:00Z', { parent_poll_id: 'p-where' }),
      poll('p-where', 'voting', '2026-09-02T00:00:00Z'),
      poll('p-date', 'decided', '2026-09-01T00:00:00Z', { topic: 'date', winning_option_id: 'o-fri' }),
      poll('p-elsewhere', 'voting', '2026-09-01T00:00:00Z', { event_id: 'plan-2' }),
    ];

    const page = await load(YES);

    expect(page.poll?.id).toBe('p-where');
    expect(page.decidedPolls.map((row) => row.id)).toEqual(['p-date']);
    expect(page.pendingPolls.map((row) => row.id)).toEqual(['p-food']);
    expect(page.invitationsReady).toBe(false);
    expect(page.options.map((option) => option.id)).toEqual(['o-beach', 'o-park']);
    expect(page.results).toEqual([{ option_id: 'o-beach', score: 2 }]);
    expect(page.myVotes).toEqual({ 'o-beach': 2 });
    expect(queriesOn('session', 'poll_votes')[0].filters).toEqual([
      ['eq', 'poll_id', 'p-where'],
      ['eq', 'voter_id', YES],
    ]);
    expect(rpcCallsTo('poll_results')).toEqual([{ client: 'session', name: 'poll_results', args: { p_poll: 'p-where' } }]);
    expect(page.allDecidedWinners).toEqual({ 'p-date': 'Fri evening' });
  });

  it('is ready once nothing is being answered, showing the latest decided poll', async () => {
    db.tables.polls = [
      poll('p-date', 'decided', '2026-09-01T00:00:00Z', { winning_option_id: 'o-fri' }),
      poll('p-time', 'decided', '2026-09-02T00:00:00Z', { winning_option_id: 'o-sat' }),
      // A follow-up waiting on nothing still open does not hold the plan back.
      poll('p-food', 'pending', '2026-09-03T00:00:00Z'),
    ];

    const page = await load(HOST);

    expect(page.invitationsReady).toBe(true);
    expect(page.poll?.id).toBe('p-time');
    expect(page.decidedPolls.map((row) => row.id)).toEqual(['p-date']);
    expect(page.allDecidedWinners).toEqual({ 'p-date': 'Fri evening' });
    expect(page.options.map((option) => option.id)).toEqual(['o-sat']);
  });

  it('treats a plan with no polls as settled, and asks the database nothing about polls', async () => {
    const page = await load(HOST);

    expect(page).toMatchObject({ poll: null, decidedPolls: [], pendingPolls: [], invitationsReady: true, options: [], results: [], myVotes: {} });
    expect(queriesOn('session', 'poll_options')).toEqual([]);
    expect(queriesOn('session', 'poll_votes')).toEqual([]);
    expect(rpcCallsTo('poll_results')).toEqual([]);
  });

  it('passes the availability snapshot through for the grid', async () => {
    const page = await load(YES);

    expect(mocks.loadAvailability).toHaveBeenCalledWith(PLAN_ID);
    expect(page.availability).toEqual({ counts: [{ slot: '2026-10-06T17:00:00.000Z', people: 2 }], responders: 2, eligiblePeople: 4 });
  });
});

describe('the calendar overlay while a date is chosen', () => {
  /** `count` stored quarter-hours of busy time starting at `from`. */
  const quarters = (from: string, count: number) =>
    Array.from({ length: count }, (_, index) => new Date(Date.parse(from) + index * 15 * 60_000).toISOString());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T19:00:00.000Z'));
  });

  it('maps the viewer’s own busy quarters onto the plan zone’s bands', async () => {
    seedPlan({ status: 'deciding', starts_at: null, time_zone: 'America/Los_Angeles' });
    // Tuesday 5–8pm in Los Angeles: three of the evening's five hours.
    const mine = quarters('2026-10-07T00:00:00.000Z', 12);
    db.tables.calendar_busy = [
      ...mine.map((slot) => ({ user_id: SENT, slot })),
      ...quarters('2026-10-06T15:00:00.000Z', 20).map((slot) => ({ user_id: YES, slot })),
    ];
    db.rpc.calendar_subscription_status = () => [
      { source_host: 'calendar.google.com', last_synced_at: '2026-10-05T18:00:00Z', last_status: 'ok', covered_through: '2026-11-05T00:00:00Z' },
    ];

    const page = await load(SENT);

    expect(queriesOn('session', 'calendar_busy')[0].filters).toEqual([['eq', 'user_id', SENT]]);
    // Tuesday evening where the plan is; read as UTC it would be no band at all.
    expect(page.calendarBusy).toEqual(['2026-10-06T17:00:00.000Z']);
    expect(busyBandsFromStored(mine, 'UTC')).toEqual([]);
    expect(page.calendarStatus).toEqual({
      connected: true,
      sourceHost: 'calendar.google.com',
      lastSyncedAt: '2026-10-05T18:00:00Z',
      lastStatus: 'ok',
      coveredThrough: '2026-11-05T00:00:00Z',
      usable: true,
    });
    expect(page.calendarEvent).toBeNull();
  });

  it('lines busy bands up with the grid’s zone (the plan’s, else UTC), not the display fallback', async () => {
    // No zone on the plan: the page reads in the host's zone, but the grid —
    // and so the busy bands laid over it — is in UTC.
    seedPlan({ status: 'deciding', starts_at: null, time_zone: null });
    const mine = quarters('2026-10-06T17:00:00.000Z', 12);
    db.tables.calendar_busy = mine.map((slot) => ({ user_id: SENT, slot }));

    const page = await load(SENT);

    expect(page.eventZone).toBe('America/New_York');
    expect(page.calendarBusy).toEqual(['2026-10-06T17:00:00.000Z']);
    // What the host's zone would have marked instead: Tuesday afternoon.
    expect(busyBandsFromStored(mine, 'America/New_York')).toEqual(['2026-10-06T12:00:00.000Z']);
  });

  it.each([
    { why: 'with no calendar connected', rows: [], connected: false },
    { why: 'whose last sync failed', rows: [{ source_host: 'x.test', last_synced_at: null, last_status: 'error', covered_through: '2026-11-05T00:00:00Z' }], connected: true },
    { why: 'with nothing covered yet', rows: [{ source_host: 'x.test', last_synced_at: null, last_status: 'ok', covered_through: null }], connected: true },
  ])('does not offer to fill from a calendar $why', async ({ rows, connected }) => {
    seedPlan({ status: 'deciding', starts_at: null });
    db.rpc.calendar_subscription_status = () => rows;

    const page = await load(SENT);

    expect(page.calendarStatus).toMatchObject({ connected, usable: false });
  });

  it('asks nothing about calendars once the plan has a date, and offers “add to calendar” instead', async () => {
    const page = await load(SENT);

    expect(queriesOn('session', 'calendar_busy')).toEqual([]);
    expect(rpcCallsTo('calendar_subscription_status')).toEqual([]);
    expect(page.calendarBusy).toEqual([]);
    expect(page.calendarStatus).toBeNull();
    expect(page.calendarEvent).toEqual({
      title: 'Taco night',
      description: 'Bring salsa',
      location: 'Casa Azul',
      startsAt: '2026-10-10T01:00:00.000Z',
      endsAt: null,
    });
  });
});

describe('the zone the plan reads in', () => {
  it.each([
    { planZone: 'America/Los_Angeles', hostZone: 'America/New_York', expected: 'America/Los_Angeles' },
    { planZone: 'Not/AZone', hostZone: 'America/New_York', expected: 'America/New_York' },
    { planZone: null, hostZone: 'Europe/Berlin', expected: 'Europe/Berlin' },
    { planZone: null, hostZone: 'bogus', expected: null },
    { planZone: null, hostZone: null, expected: null },
  ])('plan $planZone, host $hostZone → $expected', async ({ planZone, hostZone, expected }) => {
    seedPlan({
      time_zone: planZone,
      host: { id: HOST, display_name: 'Hana', handle: 'hana', avatar_url: null, tagline: null, timezone: hostZone },
    });

    const page = await load(YES);

    expect(page.eventZone).toBe(expected);
  });
});

describe('RSVP answers', () => {
  it('groups the host’s answers by invitation — two guests called Sam are two cards — in question order', async () => {
    const page = await load(HOST);

    expect(page.questions.map((question) => question.id)).toEqual(['q-diet', 'q-song']);
    expect(queriesOn('admin', 'invite_answers')[0].filters).toEqual([['in', 'question_id', ['q-diet', 'q-song']]]);
    expect(page.answersByGuest).toEqual([
      {
        inviteId: 'inv-sam',
        name: 'Sam',
        answers: [
          { prompt: 'Dietary needs?', answer: 'None' },
          { prompt: 'Song request?', answer: 'Toto' },
        ],
      },
      { inviteId: 'inv-sent', name: 'Sam', answers: [{ prompt: 'Dietary needs?', answer: 'Vegan' }] },
    ]);
  });

  it('reads no answers for a plan that asks no questions', async () => {
    db.tables.event_questions = [];

    const page = await load(HOST);

    expect(queriesOn('admin', 'invite_answers')).toEqual([]);
    expect(page.answersByGuest).toEqual([]);
  });

  it('never loads answers for a guest', async () => {
    const page = await load(YES);

    expect(page.questions).toHaveLength(2);
    expect(queriesOn('admin', 'invite_answers')).toEqual([]);
    expect(page.answersByGuest).toEqual([]);
  });
});

describe('the thread', () => {
  it('signs voice notes and quotes what each reply answered, even when the original is gone', async () => {
    db.tables.event_comments.push({
      id: 'c-4', event_id: PLAN_ID, body: 'Late reply', voice_url: null, voice_duration_seconds: null,
      created_at: '2026-09-20T04:00:00Z', author_id: YES, reply_to_id: 'c-deleted', author: null,
    });

    const page = await load(YES);

    expect(page.threadComments.map(({ id, author_name, voice_url, reply_to }) => ({ id, author_name, voice_url, reply_to }))).toEqual([
      { id: 'c-1', author_name: 'Yara', voice_url: null, reply_to: null },
      { id: 'c-2', author_name: 'Hana', voice_url: null, reply_to: { author_name: 'Yara', excerpt: 'First! so excited' } },
      { id: 'c-3', author_name: 'Sam', voice_url: 'https://media.test/voice/c-3.webm', reply_to: { author_name: 'Hana', excerpt: 'Same' } },
      { id: 'c-4', author_name: 'Guest', voice_url: null, reply_to: { author_name: 'an earlier message', excerpt: null } },
    ]);
    expect(page.threadTotal).toBe(4);
  });

  it('quotes a few words, or says it was a voice note', () => {
    expect(threadExcerpt('  see   you\nthere ', false)).toBe('see you there');
    expect(threadExcerpt('x'.repeat(120), false)).toBe(`${'x'.repeat(89)}…`);
    expect(threadExcerpt(null, true)).toBe('🎤 Voice note');
    expect(threadExcerpt('   ', false)).toBeNull();
  });
});

describe('what every viewer shares', () => {
  it('shows announcements newest first, signed media, and the verified venue’s perk', async () => {
    seedPlan({ status: 'cancelled', cancel_voice_url: 'voice/cancel.webm' });

    const page = await load(YES);

    expect(page.announcements).toEqual([
      { id: 'a-2', body: 'Bring a jacket', created_at: '2026-09-21T00:00:00Z', author_name: 'Host' },
      { id: 'a-1', body: 'Parking is behind', created_at: '2026-09-20T00:00:00Z', author_name: 'Hana' },
    ]);
    expect(page.cancelVoiceUrl).toBe('https://media.test/voice/cancel.webm');
    expect(page.venuePerk).toEqual({ name: 'Casa Azul', perk: 'Free chips' });
  });

  it('matches the venue by its literal name, so a % or _ the host typed is not a wildcard', async () => {
    seedPlan({ location_name: ' 100% Tacos_ ' });
    db.tables.venues = [{ name: '100 great Tacos!', perk: 'Wrong place', status: 'verified' }];

    expect((await load(YES)).venuePerk).toBeNull();

    db.tables.venues.push({ name: '100% tacos_', perk: 'Two for one', status: 'verified' });
    expect((await load(YES)).venuePerk).toEqual({ name: '100% tacos_', perk: 'Two for one' });
  });

  it('asks about no venue when the plan has no place', async () => {
    seedPlan({ location_name: null });

    const page = await load(YES);

    expect(queriesOn('session', 'venues')).toEqual([]);
    expect(page.venuePerk).toBeNull();
  });
});
