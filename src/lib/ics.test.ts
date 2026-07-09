import { describe, expect, it } from 'vitest';
import { buildCalendar, icsEscape, type IcsEvent } from './ics';

const NOW = '2026-07-09T12:00:00.000Z';

describe('icsEscape', () => {
  it('escapes special characters', () => {
    expect(icsEscape('Dinner; drinks, later\nRSVP')).toBe(
      'Dinner\\; drinks\\, later\\nRSVP',
    );
  });
});

describe('buildCalendar', () => {
  const base: IcsEvent = {
    id: 'evt1',
    title: 'Taco night',
    description: 'bring salsa',
    location_name: "Ana's place",
    location_address: '1 Main St',
    starts_at: '2026-07-10T23:00:00.000Z',
    ends_at: '2026-07-11T01:00:00.000Z',
  };

  it('wraps events in a VCALENDAR with a VEVENT', () => {
    const cal = buildCalendar([base], NOW);
    expect(cal).toContain('BEGIN:VCALENDAR');
    expect(cal).toContain('END:VCALENDAR');
    expect(cal).toContain('BEGIN:VEVENT');
    expect(cal).toContain('UID:evt1@switchboard');
    expect(cal).toContain('SUMMARY:Taco night');
    expect(cal).toContain('DTSTART:20260710T230000Z');
    expect(cal).toContain('DTEND:20260711T010000Z');
    expect(cal).toContain("LOCATION:Ana's place\\, 1 Main St");
    // CRLF line endings per RFC 5545.
    expect(cal).toContain('\r\n');
  });

  it('defaults the end to two hours after start when absent', () => {
    const cal = buildCalendar([{ ...base, ends_at: null }], NOW);
    expect(cal).toContain('DTSTART:20260710T230000Z');
    expect(cal).toContain('DTEND:20260711T010000Z');
  });

  it('skips events with no start time', () => {
    const cal = buildCalendar([{ ...base, starts_at: null }], NOW);
    expect(cal).not.toContain('BEGIN:VEVENT');
  });

  it('emits multiple VEVENTs', () => {
    const cal = buildCalendar([base, { ...base, id: 'evt2', title: 'Hike' }], NOW);
    expect(cal.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(cal).toContain('SUMMARY:Hike');
  });
});
