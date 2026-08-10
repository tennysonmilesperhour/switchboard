import { describe, it, expect } from 'vitest';
import { greetingFor, hourInZone } from './greeting';

describe('greetingFor', () => {
  // The reported bug: a beta tester in US Pacific opened Home at 9:00am and was
  // told "Good afternoon". Home is a server component, so the hour came from the
  // runtime zone — 16:00 UTC on Vercel — not from their clock.
  const nineAmPacific = new Date('2026-08-10T16:00:00.000Z');

  it('greets by the reader’s zone, not the server’s UTC', () => {
    expect(greetingFor(nineAmPacific, 'America/Los_Angeles')).toBe('Good morning');
    // The exact regression: the same instant read as UTC.
    expect(greetingFor(nineAmPacific, 'UTC')).toBe('Good afternoon');
  });

  it('reads the same instant differently around the world', () => {
    // 16:00Z is 12:00 in New York, 18:00 in Berlin, 01:00 the next day in Tokyo.
    expect(greetingFor(nineAmPacific, 'America/New_York')).toBe('Good afternoon');
    expect(greetingFor(nineAmPacific, 'Europe/Berlin')).toBe('Good evening');
    expect(greetingFor(nineAmPacific, 'Asia/Tokyo')).toBe('Good morning');
  });

  it('turns over at noon and at five, in the reader’s zone', () => {
    const at = (iso: string) => greetingFor(new Date(iso), 'America/Chicago');
    // Chicago is UTC-5 in August (CDT).
    expect(at('2026-08-10T05:00:00.000Z')).toBe('Good morning'); // 00:00
    expect(at('2026-08-10T16:59:00.000Z')).toBe('Good morning'); // 11:59
    expect(at('2026-08-10T17:00:00.000Z')).toBe('Good afternoon'); // 12:00
    expect(at('2026-08-10T21:59:00.000Z')).toBe('Good afternoon'); // 16:59
    expect(at('2026-08-10T22:00:00.000Z')).toBe('Good evening'); // 17:00
    expect(at('2026-08-11T04:59:00.000Z')).toBe('Good evening'); // 23:59
  });

  it('follows a zone across its own DST change', () => {
    // 15:30Z is 8:30am in Los Angeles under PDT and 7:30am under PST — both
    // morning; the offset must come from the date, not a hardcoded number.
    expect(hourInZone(new Date('2026-08-10T15:30:00.000Z'), 'America/Los_Angeles')).toBe(8);
    expect(hourInZone(new Date('2026-01-10T15:30:00.000Z'), 'America/Los_Angeles')).toBe(7);
  });

  it('handles zones on a half-hour offset', () => {
    // Kolkata is UTC+5:30, so 16:00Z is 21:30 — evening, not afternoon.
    expect(hourInZone(nineAmPacific, 'Asia/Kolkata')).toBe(21);
    expect(greetingFor(nineAmPacific, 'Asia/Kolkata')).toBe('Good evening');
  });

  it('never throws on a zone the runtime doesn’t know', () => {
    // `profiles.timezone` comes from the client; a malformed value must not
    // break the dashboard render.
    expect(() => greetingFor(nineAmPacific, 'Not/AZone')).not.toThrow();
    expect(() => greetingFor(nineAmPacific, null)).not.toThrow();
    expect(() => greetingFor(nineAmPacific, '')).not.toThrow();
    expect(hourInZone(nineAmPacific, 'Not/AZone')).toBe(nineAmPacific.getHours());
  });

  it('reads midnight as hour 0, not 24 or 12', () => {
    expect(hourInZone(new Date('2026-08-10T00:00:00.000Z'), 'UTC')).toBe(0);
    expect(greetingFor(new Date('2026-08-10T00:00:00.000Z'), 'UTC')).toBe('Good morning');
    expect(hourInZone(new Date('2026-08-10T12:00:00.000Z'), 'UTC')).toBe(12);
  });
});
