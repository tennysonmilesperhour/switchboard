import { describe, expect, it } from 'vitest';
import {
  MAX_SEED_OPTIONS,
  cleanSeedOptions,
  decidingGuestEmail,
  decidingGuestSms,
  pollAudience,
  pollOpenedNotice,
  pollOutcomeNotices,
  type OutcomeInput,
} from './poll-notices';

describe('pollAudience', () => {
  const invites = [
    { invitee_id: 'queued-1', status: 'queued' },
    { invitee_id: 'yes-1', status: 'accepted' },
    { invitee_id: 'no-1', status: 'declined' },
    { invitee_id: 'gone-1', status: 'expired' },
    { invitee_id: null, status: 'queued' },
    { invitee_id: 'cohost-1', status: 'accepted' },
  ];

  it('puts a deciding plan’s questions to everyone on the list, plus the hosts', () => {
    // Queued invitees are the voters a deciding plan exists to ask; follow-ups
    // used to reach only people who had already said yes.
    expect(
      pollAudience({ eventStatus: 'deciding', hostId: 'host', cohostIds: ['cohost-1'], invites }),
    ).toEqual({ managers: ['host', 'cohost-1'], guests: ['queued-1', 'yes-1'] });
  });

  it('asks only people who said yes once invitations are out', () => {
    expect(
      pollAudience({ eventStatus: 'inviting', hostId: 'host', cohostIds: [], invites }),
    ).toEqual({ managers: ['host'], guests: ['yes-1', 'cohost-1'] });
  });

  it('never asks the declined, and never lists a host twice', () => {
    const { managers, guests } = pollAudience({
      eventStatus: 'deciding',
      hostId: 'host',
      cohostIds: ['host', null, 'cohost-1'],
      invites,
    });
    expect(managers).toEqual(['host', 'cohost-1']);
    expect(guests).not.toContain('no-1');
    expect(guests).not.toContain('cohost-1');
  });
});

describe('pollOpenedNotice', () => {
  const base = { eventId: 'e1', eventTitle: 'Board games', question: 'When should this be?' };

  it('asks for help picking the date when a plan starts as a vote without one', () => {
    const notice = pollOpenedNotice({ ...base, reason: 'created', hostName: 'Sam', needsDate: true });
    expect(notice).toMatchObject({ kind: 'poll_opened', url: '/events/e1' });
    expect(notice.title).toBe('Help pick the date: Board games');
    expect(notice.body).toContain('Sam');
  });

  it('names the question when the date is already set', () => {
    const notice = pollOpenedNotice({ ...base, question: 'Where should we go?', reason: 'created', needsDate: false });
    expect(notice.title).toBe('Help decide: Board games');
    expect(notice.body).toContain('Where should we go?');
  });

  it('tells voters a runoff needs them again', () => {
    const notice = pollOpenedNotice({ ...base, reason: 'runoff' });
    expect(notice.title).toBe('Final round: When should this be?');
    expect(notice.body).toMatch(/rate them again/);
  });

  it('keeps the follow-up wording', () => {
    expect(pollOpenedNotice({ ...base, reason: 'follow-up' }).title).toBe(
      "That's settled — now: When should this be?",
    );
  });
});

describe('pollOutcomeNotices', () => {
  const base: OutcomeInput = {
    eventId: 'e1',
    eventTitle: 'Board games',
    question: 'When should this be?',
    hostName: 'Sam',
    winnerLabel: 'Friday, October 2 · evening',
    ideas: 3,
    deciding: true,
    hasDate: true,
    date: { kind: 'set', startsAt: '2026-10-02T22:00:00.000Z', timeZone: 'America/New_York' },
    dateText: 'Fri, Oct 2, 6:00 PM EDT',
  };

  it('tells the group the result and the date it set', () => {
    const { guests, managers } = pollOutcomeNotices(base);
    expect(guests).toMatchObject({ kind: 'event_date_set', title: 'It’s decided: Friday, October 2 · evening' });
    expect(guests?.body).toContain('Fri, Oct 2, 6:00 PM EDT');
    expect(managers.body).toBe('Board games now starts Fri, Oct 2, 6:00 PM EDT. Send the invitations when you’re ready.');
  });

  it('asks the host for a date when a free-text idea won', () => {
    const { guests, managers } = pollOutcomeNotices({
      ...base,
      winnerLabel: 'The rooftop',
      hasDate: false,
      date: { kind: 'none' },
      dateText: null,
    });
    expect(guests?.kind).toBe('event_updated');
    expect(guests?.body).not.toMatch(/It’s (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
    expect(managers.body).toMatch(/Set the date next/);
  });

  it('says so when the winning time has already started', () => {
    const { managers } = pollOutcomeNotices({ ...base, hasDate: false, date: { kind: 'past' }, dateText: null });
    expect(managers.body).toMatch(/already started, so set the date/);
  });

  it('tells the host it is their pick when nobody won', () => {
    const { guests, managers } = pollOutcomeNotices({ ...base, winnerLabel: null, date: { kind: 'none' } });
    expect(managers.title).toBe('Your pick: When should this be?');
    expect(guests?.body).toBe('Sam is choosing for Board games from what the group said.');
  });

  it('sends the host to set it themselves when the poll closed empty', () => {
    const { guests, managers } = pollOutcomeNotices({
      ...base,
      winnerLabel: null,
      ideas: 0,
      date: { kind: 'none' },
    });
    expect(guests).toBeNull();
    expect(managers.url).toBe('/events/e1/edit');
    expect(managers.title).toBe('Nothing to choose: When should this be?');
  });

  it('does not talk about sending invitations for a plan already past deciding', () => {
    const { managers } = pollOutcomeNotices({
      ...base,
      question: 'Where should we go?',
      winnerLabel: 'The rooftop',
      deciding: false,
      date: { kind: 'none' },
      dateText: null,
    });
    expect(managers.body).not.toMatch(/invitations/);
  });
});

describe('the guest link at creation (decision D4)', () => {
  const copy = {
    hostName: 'Sam',
    eventTitle: 'Board games',
    needsDate: true,
    shareUrl: 'https://switchboard.example/i/tok',
  };

  it('emails the share link with "help pick the date"', () => {
    const email = decidingGuestEmail({ ...copy, guestName: 'Ana' });
    expect(email.subject).toBe('Help pick the date: Board games');
    expect(email.text).toContain('Hi Ana,');
    expect(email.text).toContain('help pick the date');
    expect(email.text).toContain('https://switchboard.example/i/tok');
  });

  it('asks for help deciding when the date is already set', () => {
    const email = decidingGuestEmail({ ...copy, needsDate: false, guestName: null });
    expect(email.subject).toBe('Help decide: Board games');
    expect(email.text).toContain('Hi there,');
  });

  it('keeps the text short enough for one request and carries STOP', () => {
    const sms = decidingGuestSms({ ...copy, eventTitle: 'x'.repeat(300) });
    expect(sms.length).toBeLessThanOrEqual(450);
    expect(sms).toContain('https://switchboard.example/i/tok');
    expect(sms).toMatch(/Reply STOP/);
  });
});

describe('cleanSeedOptions', () => {
  it('cleans the wizard’s ideas the way the suggestion box would', () => {
    expect(
      cleanSeedOptions(['  Pizza ', 'pizza!', '', 'Bowling https://bowl.example/lanes', 42, null]),
    ).toEqual([
      { label: 'Pizza', linkUrl: null },
      { label: 'Bowling', linkUrl: 'https://bowl.example/lanes' },
    ]);
  });

  it('caps the list and cuts an over-long idea rather than failing the plan', () => {
    const many = Array.from({ length: 9 }, (_, i) => `Idea ${i}`);
    expect(cleanSeedOptions(many)).toHaveLength(MAX_SEED_OPTIONS);
    expect(cleanSeedOptions(['y'.repeat(500)])[0].label).toHaveLength(120);
  });

  it('ignores anything that is not a list', () => {
    expect(cleanSeedOptions(undefined)).toEqual([]);
    expect(cleanSeedOptions('Pizza')).toEqual([]);
  });
});
