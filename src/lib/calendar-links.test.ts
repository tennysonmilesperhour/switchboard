import { describe, expect, test } from 'vitest';
import { googleCalendarUrl, outlookCalendarUrl } from './calendar-links';

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
