import { describe, expect, it } from 'vitest';
import {
  LEGACY_ZONE_NAMES,
  canonicalZone,
  formatGmtOffset,
  timeZoneOptions,
  zoneCity,
  zoneOffsetMinutes,
} from './time-zones';

// A fixed winter instant, so DST never moves an offset under the test.
const JAN = new Date('2026-01-15T12:00:00Z');

describe('time zone labels', () => {
  it('formats offsets the way people read them', () => {
    expect(formatGmtOffset(330)).toBe('GMT+5:30');
    expect(formatGmtOffset(-480)).toBe('GMT-8');
    expect(formatGmtOffset(0)).toBe('GMT+0');
    expect(formatGmtOffset(345)).toBe('GMT+5:45');
  });

  it('reads the current offset from the runtime', () => {
    expect(zoneOffsetMinutes('Asia/Calcutta', JAN)).toBe(330);
    expect(zoneOffsetMinutes('America/Los_Angeles', JAN)).toBe(-480);
    expect(zoneOffsetMinutes('UTC', JAN)).toBe(0);
  });

  it('names the city, today’s spelling, with the region when there is one', () => {
    expect(zoneCity('Asia/Calcutta')).toBe('Kolkata');
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(zoneCity('America/North_Dakota/Center')).toBe('Center, North Dakota');
    expect(zoneCity('UTC')).toBe('UTC');
  });

  it('maps every retired spelling to a zone the runtime accepts', () => {
    for (const [legacy, current] of Object.entries(LEGACY_ZONE_NAMES)) {
      expect(canonicalZone(legacy)).toBe(current);
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: current })).not.toThrow();
    }
  });
});

describe('timeZoneOptions', () => {
  it('labels each zone with its city and offset, sorted by offset then name', () => {
    const options = timeZoneOptions(
      ['UTC', 'Asia/Calcutta', 'America/New_York', 'America/Los_Angeles', 'Europe/London'],
      [],
      JAN,
    );
    expect(options).toEqual([
      { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8)' },
      { value: 'America/New_York', label: 'New York (GMT-5)' },
      { value: 'Europe/London', label: 'London (GMT+0)' },
      { value: 'UTC', label: 'UTC (GMT+0)' },
      { value: 'Asia/Kolkata', label: 'Kolkata (GMT+5:30)' },
    ]);
  });

  it('lists a place once when both spellings are present', () => {
    const options = timeZoneOptions(['Asia/Calcutta', 'Asia/Kolkata', 'Europe/Kiev'], [], JAN);
    expect(options.map((option) => option.value)).toEqual(['Europe/Kyiv', 'Asia/Kolkata']);
  });

  it('keeps a saved or device zone exactly as spelled so it shows selected', () => {
    const options = timeZoneOptions(
      ['UTC', 'Asia/Kolkata', 'America/Buenos_Aires'],
      ['Asia/Calcutta', 'America/Buenos_Aires'],
      JAN,
    );
    expect(options).toContainEqual({ value: 'Asia/Calcutta', label: 'Kolkata (GMT+5:30)' });
    expect(options).toContainEqual({
      value: 'America/Buenos_Aires',
      label: 'Buenos Aires, Argentina (GMT-3)',
    });
    expect(options.some((option) => option.value === 'Asia/Kolkata')).toBe(false);
  });

  it('keeps every IANA id this runtime lists reachable, each place once', () => {
    const zones = Intl.supportedValuesOf('timeZone');
    const options = timeZoneOptions(['UTC', ...zones], [], JAN);
    const values = new Set(options.map((option) => option.value));
    expect(values.size).toBe(options.length);
    for (const zone of zones) expect(values.has(canonicalZone(zone))).toBe(true);
    for (const legacy of Object.keys(LEGACY_ZONE_NAMES)) expect(values.has(legacy)).toBe(false);
  });
});
