import { describe, expect, test } from 'vitest';
import {
  calendarFeedUrl,
  googleCalendarUrl,
  outlookCalendarUrl,
  webcalSubscribeUrl,
} from './calendar-links';

const event = {
  title: 'Game night',
  description: 'Bring snacks',
  location: 'My place',
  startsAt: '2026-07-10T23:00:00.000Z',
  endsAt: '2026-07-11T01:00:00.000Z',
};

describe('googleCalendarUrl', () => {
  test('encodes title, location and a compact date range', () => {
    const url = googleCalendarUrl(event);
    expect(url).toContain('calendar.google.com');
    expect(url).toContain('text=Game+night');
    expect(url).toContain('dates=20260710T230000Z%2F20260711T010000Z');
    expect(url).toContain('location=My+place');
  });

  test('defaults to a 2-hour block when no end time', () => {
    const url = googleCalendarUrl({ ...event, endsAt: null });
    expect(url).toContain('dates=20260710T230000Z%2F20260711T010000Z');
  });
});

describe('outlookCalendarUrl', () => {
  test('uses ISO start/end and the compose deeplink', () => {
    const url = outlookCalendarUrl(event);
    expect(url).toContain('outlook.live.com');
    expect(url).toContain('subject=Game+night');
    expect(url).toContain(encodeURIComponent('2026-07-10T23:00:00.000Z'));
  });
});

const TOKEN = 'd9793867-2963-4c92-bad0-6a2ea04f895f';

describe('calendarFeedUrl', () => {
  test('roots the feed at the given origin', () => {
    expect(calendarFeedUrl('https://switchboard.app', TOKEN)).toBe(
      `https://switchboard.app/api/calendar/${TOKEN}`,
    );
  });

  test('tolerates a trailing slash on the origin', () => {
    expect(calendarFeedUrl('https://switchboard.app/', TOKEN)).toBe(
      `https://switchboard.app/api/calendar/${TOKEN}`,
    );
  });
});

describe('webcalSubscribeUrl', () => {
  test('swaps only the scheme, preserving host and path', () => {
    expect(webcalSubscribeUrl('https://switchboard.app', TOKEN)).toBe(
      `webcal://switchboard.app/api/calendar/${TOKEN}`,
    );
  });

  test('also rewrites a plain-http origin (e.g. local dev)', () => {
    expect(webcalSubscribeUrl('http://localhost:3000', TOKEN)).toBe(
      `webcal://localhost:3000/api/calendar/${TOKEN}`,
    );
  });
});
