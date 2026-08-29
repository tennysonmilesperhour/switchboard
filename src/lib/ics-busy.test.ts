import { describe, expect, test } from 'vitest';

import { parseBusyIntervals, busyGridSlots } from './ics-busy';
import { gridSlots, slotRange } from './availability';

/** Wrap VEVENT bodies in the surrounding calendar an exporter would send. */
function ics(...events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//EN',
    ...events.flatMap((e) => ['BEGIN:VEVENT', ...e.trim().split('\n'), 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n');
}

const WINDOW_START = new Date('2026-09-01T00:00:00Z');
const WINDOW_END = new Date('2026-09-08T00:00:00Z');

function busy(text: string) {
  return parseBusyIntervals(text, WINDOW_START, WINDOW_END);
}

describe('reading times out of a calendar', () => {
  test('a plain UTC event becomes one busy block', () => {
    const [block] = busy(ics('DTSTART:20260902T140000Z\nDTEND:20260902T160000Z\nSUMMARY:Dentist'));
    expect(new Date(block.start).toISOString()).toBe('2026-09-02T14:00:00.000Z');
    expect(new Date(block.end).toISOString()).toBe('2026-09-02T16:00:00.000Z');
  });

  test('nothing but times comes back', () => {
    // The privacy ceiling: a caller cannot leak a summary it was never given.
    const [block] = busy(
      ics('DTSTART:20260902T140000Z\nDTEND:20260902T160000Z\nSUMMARY:Therapy\nLOCATION:Clinic'),
    );
    expect(Object.keys(block).sort()).toEqual(['end', 'start']);
  });

  test('a floating time in a named zone is resolved to the real instant', () => {
    // 09:00 in Denver (UTC-6 in September) is 15:00Z. Reading it as UTC would
    // put every event in the week six hours early.
    const [block] = busy(
      ics('DTSTART;TZID=America/Denver:20260902T090000\nDTEND;TZID=America/Denver:20260902T100000'),
    );
    expect(new Date(block.start).toISOString()).toBe('2026-09-02T15:00:00.000Z');
  });

  test('DURATION is honoured when there is no DTEND', () => {
    const [block] = busy(ics('DTSTART:20260902T140000Z\nDURATION:PT90M'));
    expect(block.end - block.start).toBe(90 * 60_000);
  });

  test('folded lines are rejoined before parsing', () => {
    // A long RRULE is split across lines by exporters; parsing line-by-line
    // would silently drop everything after the fold.
    const folded =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260902T140000Z\r\nDTEND:20260902T150000Z\r\n' +
      'RRULE:FREQ=DAI\r\n LY;COUNT=2\r\nEND:VEVENT\r\nEND:VCALENDAR';
    expect(busy(folded)).toHaveLength(2);
  });

  test('events marked free, and cancelled ones, are not busy', () => {
    expect(
      busy(ics('DTSTART:20260902T140000Z\nDTEND:20260902T160000Z\nTRANSP:TRANSPARENT')),
    ).toHaveLength(0);
    expect(
      busy(ics('DTSTART:20260902T140000Z\nDTEND:20260902T160000Z\nSTATUS:CANCELLED')),
    ).toHaveLength(0);
  });

  test('an event outside the window is left out', () => {
    expect(busy(ics('DTSTART:20260820T140000Z\nDTEND:20260820T160000Z'))).toHaveLength(0);
  });
});

describe('repeating events', () => {
  test('a daily series fills every day of the window', () => {
    expect(busy(ics('DTSTART:20260901T140000Z\nDTEND:20260901T150000Z\nRRULE:FREQ=DAILY'))).toHaveLength(7);
  });

  test('a series that began years ago still reaches this week', () => {
    // The regression that matters most: stepping a day at a time from 2020
    // exhausts any iteration cap long before today, and the week renders empty
    // — a calendar full of standups would look completely free.
    expect(
      busy(ics('DTSTART:20200106T140000Z\nDTEND:20200106T150000Z\nRRULE:FREQ=DAILY')),
    ).toHaveLength(7);
  });

  test('a weekly series lands on the weekdays it names', () => {
    // 2026-09-01 is a Tuesday; MO/WE in this window are the 2nd and 7th.
    const blocks = busy(
      ics('DTSTART:20260901T140000Z\nDTEND:20260901T150000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE'),
    );
    expect(blocks.map((b) => new Date(b.start).toISOString().slice(0, 10))).toEqual([
      '2026-09-02',
      '2026-09-07',
    ]);
  });

  test('INTERVAL is measured from where the series began, not from the window', () => {
    // Fortnightly from 2026-09-01 falls on the 1st, not the 8th — a series
    // that re-phased itself to the window would put it a week out.
    const blocks = busy(
      ics('DTSTART:20260901T140000Z\nDTEND:20260901T150000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2'),
    );
    expect(blocks.map((b) => new Date(b.start).toISOString().slice(0, 10))).toEqual(['2026-09-01']);
  });

  test('COUNT ends the series', () => {
    expect(
      busy(ics('DTSTART:20260901T140000Z\nDTEND:20260901T150000Z\nRRULE:FREQ=DAILY;COUNT=3')),
    ).toHaveLength(3);
  });

  test('UNTIL ends the series', () => {
    expect(
      busy(ics('DTSTART:20260901T140000Z\nDTEND:20260901T150000Z\nRRULE:FREQ=DAILY;UNTIL=20260903T000000Z')),
    ).toHaveLength(2);
  });

  test('a cancelled instance is dropped by EXDATE', () => {
    const blocks = busy(
      ics(
        'DTSTART:20260901T140000Z\nDTEND:20260901T150000Z\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20260902T140000Z',
      ),
    );
    expect(blocks.map((b) => new Date(b.start).toISOString().slice(0, 10))).toEqual([
      '2026-09-01',
      '2026-09-03',
    ]);
  });
});

describe('turning busy time into grid slots', () => {
  const slots = gridSlots(WINDOW_START);

  test('an event covering most of a band takes the band', () => {
    // The evening band is 17:00–22:00Z; 17:00–21:00 is four of its five hours.
    const blocks = busy(ics('DTSTART:20260902T170000Z\nDTEND:20260902T210000Z'));
    expect(busyGridSlots(blocks, slots, slotRange)).toEqual(['2026-09-02T17:00:00.000Z']);
  });

  test('a short meeting does not black out the whole band', () => {
    // One hour of a five-hour evening. Blacking out the band for it would
    // teach people to ignore the prefill, which is worse than a missed hour.
    const blocks = busy(ics('DTSTART:20260902T180000Z\nDTEND:20260902T190000Z'));
    expect(busyGridSlots(blocks, slots, slotRange)).toEqual([]);
  });

  test('separate meetings in one band add up', () => {
    // Neither alone passes the threshold; together they take most of the band.
    const blocks = busy(
      ics('DTSTART:20260902T170000Z\nDTEND:20260902T190000Z', 'DTSTART:20260902T200000Z\nDTEND:20260902T220000Z'),
    );
    expect(busyGridSlots(blocks, slots, slotRange)).toEqual(['2026-09-02T17:00:00.000Z']);
  });

  test('a free week takes no slots', () => {
    expect(busyGridSlots([], slots, slotRange)).toEqual([]);
  });
});

describe('things real calendars contain', () => {
  test('a reminder does not shrink the meeting it is attached to', () => {
    // The one that mattered most: a VALARM carries its own DURATION, and
    // without component nesting it overwrote the event's. A three-hour meeting
    // came back as five minutes, so a Google calendar (which attaches a
    // reminder to almost everything) registered as very nearly free.
    const [block] = busy(
      ics(
        'DTSTART:20260902T140000Z\nDTEND:20260902T170000Z\n' +
          'BEGIN:VALARM\nTRIGGER:-PT10M\nACTION:DISPLAY\nDURATION:PT5M\nREPEAT:2\nEND:VALARM',
      ),
    );
    expect((block.end - block.start) / 60_000).toBe(180);
  });

  test('a VTIMEZONE at the top of the file adds no busy time', () => {
    // VTIMEZONE blocks carry their own DTSTART and RRULE. Read as events they
    // would fill the week with phantom commitments.
    const withZone =
      'BEGIN:VCALENDAR\r\nBEGIN:VTIMEZONE\r\nTZID:America/Denver\r\n' +
      'BEGIN:DAYLIGHT\r\nDTSTART:20260308T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3\r\nEND:DAYLIGHT\r\n' +
      'END:VTIMEZONE\r\nEND:VCALENDAR';
    expect(busy(withZone)).toHaveLength(0);
  });

  test('an Outlook zone name resolves instead of silently becoming UTC', () => {
    // Exchange writes Windows zone names. Intl throws on them, and the UTC
    // fallback put 9am Pacific at 09:00Z: seven hours out, a different band and
    // very nearly a different day.
    const [block] = busy(
      ics(
        'DTSTART;TZID=Pacific Standard Time:20260902T090000\n' +
          'DTEND;TZID=Pacific Standard Time:20260902T100000',
      ),
    );
    expect(new Date(block.start).toISOString()).toBe('2026-09-02T16:00:00.000Z');
  });

  test('overlapping meetings are not counted twice against a band', () => {
    // Two identical 90-minute meetings take 30% of a five-hour evening, not
    // 60%. Summing raw overlaps crossed the threshold and blacked out an
    // evening that was mostly free.
    const slots = gridSlots(WINDOW_START);
    const blocks = busy(
      ics(
        'DTSTART:20260902T180000Z\nDTEND:20260902T193000Z',
        'DTSTART:20260902T180000Z\nDTEND:20260902T193000Z',
      ),
    );
    expect(busyGridSlots(blocks, slots, slotRange)).toEqual([]);
  });

  test('back-to-back meetings still add up to a busy band', () => {
    // The merge must not go so far as to hide genuinely full evenings.
    const slots = gridSlots(WINDOW_START);
    const blocks = busy(
      ics(
        'DTSTART:20260902T170000Z\nDTEND:20260902T193000Z',
        'DTSTART:20260902T193000Z\nDTEND:20260902T220000Z',
      ),
    );
    expect(busyGridSlots(blocks, slots, slotRange)).toEqual(['2026-09-02T17:00:00.000Z']);
  });
});
