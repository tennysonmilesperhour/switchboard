import { describe, expect, it } from 'vitest';

import {
  BANDS,
  BUSY_STEP_MS,
  GRID_DAYS,
  bestSlots,
  busyBandsFromStored,
  busyQuarters,
  calendarWindow,
  gridSlots,
  heatLevel,
  isGridSlot,
  parseGridSlot,
  planGridZone,
  recommendAvailability,
  slotRange,
  slotStartsAt,
  upcomingSlotCounts,
} from '@/lib/availability';

const FROM = new Date('2026-08-18T09:30:00Z');

describe('gridSlots', () => {
  it('offers four bands a day for the whole window', () => {
    expect(gridSlots(FROM)).toHaveLength(GRID_DAYS * BANDS.length);
  });

  it('starts from the calendar day, not the current instant', () => {
    // Built at 09:30, the morning band for today must still be offered —
    // "I'm free this morning" is a normal thing to say at 9:30.
    expect(gridSlots(FROM)[0]).toBe('2026-08-18T08:00:00.000Z');
  });

  it('produces the same set regardless of the caller’s clock within a day', () => {
    // The counts are only comparable if everyone's grid is the same grid.
    expect(gridSlots(new Date('2026-08-18T23:59:00Z'))).toEqual(gridSlots(FROM));
  });

  it('walks forward one day at a time', () => {
    const slots = gridSlots(FROM);
    expect(slots[BANDS.length]).toBe('2026-08-19T08:00:00.000Z');
    expect(slots[slots.length - 1]).toBe('2026-08-24T22:00:00.000Z');
  });
});

describe('isGridSlot', () => {
  it('accepts a slot the grid offers', () => {
    expect(isGridSlot('2026-08-19T17:00:00.000Z', FROM)).toBe(true);
  });

  it('rejects an arbitrary timestamp', () => {
    // Without this the column is a free-form timestamp store and the heatmap
    // renders whatever a client chose to send.
    expect(isGridSlot('2026-08-19T03:17:00.000Z', FROM)).toBe(false);
  });

  it('rejects a slot outside the window', () => {
    expect(isGridSlot('2026-09-01T08:00:00.000Z', FROM)).toBe(false);
  });
});

describe('bestSlots', () => {
  const counts = [
    { slot: '2026-08-19T17:00:00.000Z', people: 2, mine: false },
    { slot: '2026-08-20T17:00:00.000Z', people: 5, mine: true },
    { slot: '2026-08-18T08:00:00.000Z', people: 5, mine: false },
    { slot: '2026-08-21T08:00:00.000Z', people: 0, mine: false },
  ];

  it('puts the best-attended first', () => {
    expect(bestSlots(counts, 1)[0].people).toBe(5);
  });

  it('breaks a tie toward the earlier slot', () => {
    // Equal turnout, so the sooner date is the one more of them can still make.
    expect(bestSlots(counts, 1)[0].slot).toBe('2026-08-18T08:00:00.000Z');
  });

  it('never offers a slot nobody picked', () => {
    expect(bestSlots(counts, 10).map((entry) => entry.people)).not.toContain(0);
  });

  it('respects the limit', () => {
    expect(bestSlots(counts, 2)).toHaveLength(2);
  });
});

describe('recommendAvailability', () => {
  const counts = [
    // Tuesday morning, Tuesday evening, and Saturday afternoon.
    { slot: '2026-09-01T08:00:00.000Z', people: 3, mine: false },
    { slot: '2026-09-01T17:00:00.000Z', people: 3, mine: true },
    { slot: '2026-09-05T12:00:00.000Z', people: 3, mine: false },
  ];

  it('waits when nobody has answered', () => {
    const result = recommendAvailability({ counts, responders: 0, eligiblePeople: 5 });
    expect(result.status).toBe('waiting');
    expect(result.slots).toEqual([]);
  });

  it('waits when fewer than sixty percent have answered', () => {
    const result = recommendAvailability({ counts, responders: 2, eligiblePeople: 5 });
    expect(result.status).toBe('waiting');
    expect(result.message).toContain('1 more answer');
  });

  it('shows a clearly provisional answer once the sample is representative', () => {
    const result = recommendAvailability({ counts, responders: 3, eligiblePeople: 5 });
    expect(result.status).toBe('provisional');
    expect(result.message).toContain('3 of 5');
    expect(result.slots).toHaveLength(3);
  });

  it('becomes actionable only when everybody has answered', () => {
    const result = recommendAvailability({ counts, responders: 3, eligiblePeople: 3 });
    expect(result.status).toBe('ready');
    expect(result.missing).toBe(0);
  });

  it('prefers evenings and weekends only when attendance is tied', () => {
    const result = recommendAvailability({ counts, responders: 3, eligiblePeople: 3 });
    expect(result.slots.map((entry) => entry.slot)).toEqual([
      '2026-09-05T12:00:00.000Z',
      '2026-09-01T17:00:00.000Z',
      '2026-09-01T08:00:00.000Z',
    ]);
  });

  it('never lets a social preference beat one more person', () => {
    const result = recommendAvailability({
      responders: 4,
      eligiblePeople: 4,
      counts: [
        { slot: '2026-09-01T08:00:00.000Z', people: 4, mine: false },
        { slot: '2026-09-05T17:00:00.000Z', people: 3, mine: false },
      ],
    });
    expect(result.slots[0].slot).toBe('2026-09-01T08:00:00.000Z');
  });

  it('says there is no good answer instead of choosing a one-person slot', () => {
    const result = recommendAvailability({
      responders: 4,
      eligiblePeople: 4,
      counts: [{ slot: '2026-09-05T17:00:00.000Z', people: 1, mine: false }],
    });
    expect(result.status).toBe('none');
    expect(result.slots).toEqual([]);
  });

  it('does not pad a good answer with low-attendance alternatives', () => {
    const result = recommendAvailability({
      responders: 4,
      eligiblePeople: 4,
      counts: [
        { slot: '2026-09-01T17:00:00.000Z', people: 3, mine: false },
        { slot: '2026-09-02T17:00:00.000Z', people: 1, mine: false },
      ],
    });
    expect(result.status).toBe('ready');
    expect(result.slots.map((entry) => entry.people)).toEqual([3]);
  });

  it('counts an explicit empty answer without inventing a recommendation', () => {
    const result = recommendAvailability({ counts: [], responders: 2, eligiblePeople: 2 });
    expect(result.status).toBe('none');
    expect(result.responders).toBe(2);
  });

  it('respects the recommendation limit', () => {
    const result = recommendAvailability(
      { counts, responders: 3, eligiblePeople: 3 },
      2,
    );
    expect(result.slots).toHaveLength(2);
  });
});

describe('heatLevel', () => {
  it('is empty when nobody is free', () => {
    expect(heatLevel(0, 5)).toBe(0);
  });

  it('gives the busiest slot the top level', () => {
    expect(heatLevel(5, 5)).toBe(4);
  });

  it('shades relative to the busiest slot, not the group', () => {
    // A plan where the best anyone manages is 3 should still show that slot as
    // the clear winner, rather than washing it out for not being everybody.
    expect(heatLevel(3, 3)).toBe(4);
    expect(heatLevel(1, 3)).toBeLessThan(4);
  });

  it('never divides by zero', () => {
    expect(heatLevel(0, 0)).toBe(0);
  });
});

// ————————————————————————— the plan's zone (G19, D5) —————————————————————————

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('planGridZone', () => {
  it('keeps a zone the runtime knows and falls back to UTC otherwise', () => {
    expect(planGridZone('America/New_York')).toBe('America/New_York');
    expect(planGridZone('Not/AZone')).toBe('UTC');
    expect(planGridZone(null)).toBe('UTC');
    expect(planGridZone('')).toBe('UTC');
  });
});

describe('gridSlots in the plan’s zone', () => {
  it('starts on the plan’s today, not Greenwich’s', () => {
    // 21:00 on Friday 2 October in New York is already Saturday in UTC. The
    // plan's grid still offers Friday, including Friday's late band.
    const nineAtNight = new Date('2026-10-03T01:00:00Z');
    expect(gridSlots(nineAtNight, GRID_DAYS, 'America/New_York')[0]).toBe('2026-10-02T08:00:00.000Z');
    expect(gridSlots(nineAtNight)[0]).toBe('2026-10-03T08:00:00.000Z');
    expect(isGridSlot('2026-10-02T22:00:00.000Z', nineAtNight, GRID_DAYS, 'America/New_York')).toBe(true);
  });

  it('does not offer yesterday to a plan ahead of Greenwich', () => {
    // 09:00 on 2 October in Auckland (NZDT, UTC+13) is 1 October in UTC.
    const aucklandMorning = new Date('2026-10-01T20:00:00Z');
    const slots = gridSlots(aucklandMorning, GRID_DAYS, 'Pacific/Auckland');
    expect(slots[0]).toBe('2026-10-02T08:00:00.000Z');
    expect(slots).toHaveLength(GRID_DAYS * BANDS.length);
    expect(slots.at(-1)).toBe('2026-10-08T22:00:00.000Z');
  });

  it('keeps the label encoding, so stored answers stay in their cells', () => {
    // Every slot is still "UTC date = the plan's date, UTC hour = the band".
    for (const slot of gridSlots(new Date('2026-10-01T12:00:00Z'), GRID_DAYS, 'Asia/Kolkata')) {
      expect(BANDS.map((band) => band.startHour)).toContain(new Date(slot).getUTCHours());
      expect(parseGridSlot(slot)).toBe(slot);
    }
  });
});

describe('slotRange in the plan’s zone', () => {
  it('turns "Friday evening" into Friday evening on the plan’s clock', () => {
    // New York is on EDT (UTC−4) in October: 5–10pm is 21:00–02:00 UTC.
    expect(slotRange('2026-10-02T17:00:00.000Z', 'America/New_York')).toEqual({
      start: Date.parse('2026-10-02T21:00:00Z'),
      end: Date.parse('2026-10-03T02:00:00Z'),
    });
  });

  it('lands on half-hour zones exactly', () => {
    // India is UTC+5:30: noon to 5pm is 06:30–11:30 UTC.
    expect(slotRange('2026-10-02T12:00:00.000Z', 'Asia/Kolkata')).toEqual({
      start: Date.parse('2026-10-02T06:30:00Z'),
      end: Date.parse('2026-10-02T11:30:00Z'),
    });
  });

  it('runs the late band to the next morning on the plan’s clock across a DST change', () => {
    // US clocks go back at 2am on Sunday 1 November 2026: Saturday's late band
    // (10pm EDT to 8am EST) is eleven hours long, not ten.
    const { start, end } = slotRange('2026-10-31T22:00:00.000Z', 'America/New_York');
    expect(iso(start)).toBe('2026-11-01T02:00:00.000Z');
    expect(iso(end)).toBe('2026-11-01T13:00:00.000Z');
    expect((end - start) / HOUR).toBe(11);
  });

  it('is unchanged in UTC', () => {
    expect(slotRange('2026-10-02T22:00:00.000Z')).toEqual({
      start: Date.parse('2026-10-02T22:00:00Z'),
      end: Date.parse('2026-10-03T08:00:00Z'),
    });
  });
});

describe('slotStartsAt (decision D5)', () => {
  it('starts an evening at 6pm in the plan’s zone', () => {
    expect(slotStartsAt('2026-10-02T17:00:00.000Z', 'America/New_York')).toBe('2026-10-02T22:00:00.000Z');
    expect(slotStartsAt('2026-10-02T17:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-02T12:30:00.000Z');
    expect(slotStartsAt('2026-10-02T17:00:00.000Z', 'UTC')).toBe('2026-10-02T18:00:00.000Z');
  });

  it('starts every other band at the band’s start', () => {
    expect(slotStartsAt('2026-10-03T08:00:00.000Z', 'Europe/London')).toBe('2026-10-03T07:00:00.000Z');
    expect(slotStartsAt('2026-10-03T12:00:00.000Z', 'Europe/London')).toBe('2026-10-03T11:00:00.000Z');
    expect(slotStartsAt('2026-10-03T22:00:00.000Z', 'Europe/London')).toBe('2026-10-03T21:00:00.000Z');
  });

  it('accepts the slot as PostgREST spells it, and nothing that is not a slot', () => {
    expect(slotStartsAt('2026-10-02T17:00:00+00:00', 'America/New_York')).toBe('2026-10-02T22:00:00.000Z');
    expect(slotStartsAt('Friday at Sam’s', 'America/New_York')).toBeNull();
    expect(slotStartsAt('2026-10-02T19:00:00.000Z', 'America/New_York')).toBeNull();
  });

  it('reads an unknown zone as UTC rather than failing', () => {
    expect(slotStartsAt('2026-10-02T12:00:00.000Z', 'Not/AZone')).toBe('2026-10-02T12:00:00.000Z');
  });
});

describe('parseGridSlot', () => {
  it('canonicalises both spellings of a slot', () => {
    expect(parseGridSlot('2026-10-02T17:00:00+00:00')).toBe('2026-10-02T17:00:00.000Z');
    expect(parseGridSlot('2026-10-02T17:00:00.000Z')).toBe('2026-10-02T17:00:00.000Z');
  });

  it('refuses anything a grid could not have produced', () => {
    for (const value of [null, undefined, '', 'Pizza', '2026-10-02', '2026-10-02T17:30:00Z', '2026-10-02T19:00:00Z']) {
      expect(parseGridSlot(value)).toBeNull();
    }
  });
});

describe('calendar busy time', () => {
  const NOW = new Date('2026-10-01T12:00:00Z');

  it('stores busy time as the quarter-hours a meeting mostly fills', () => {
    const window = calendarWindow(NOW);
    const quarters = busyQuarters(
      [
        // 10:05–10:10: five minutes of a quarter is not a busy quarter.
        { start: Date.parse('2026-10-02T10:05:00Z'), end: Date.parse('2026-10-02T10:10:00Z') },
        // 14:00–14:40: two full quarters and ten minutes of the third.
        { start: Date.parse('2026-10-02T14:00:00Z'), end: Date.parse('2026-10-02T14:40:00Z') },
      ],
      window,
    );
    expect(quarters).toEqual([
      '2026-10-02T14:00:00.000Z',
      '2026-10-02T14:15:00.000Z',
      '2026-10-02T14:30:00.000Z',
    ]);
  });

  it('marks the plan’s evening busy, not Greenwich’s', () => {
    // 5:30–9:30pm EDT on Friday is 21:30–01:30 UTC: most of New York's Friday
    // evening. Read as UTC bands it touched two bands and took neither, which is
    // the "Fill from my calendar marks the wrong bands" bug.
    const quarters = busyQuarters(
      [{ start: Date.parse('2026-10-02T21:30:00Z'), end: Date.parse('2026-10-03T01:30:00Z') }],
      calendarWindow(NOW),
    );
    expect(busyBandsFromStored(quarters, 'America/New_York', NOW)).toEqual(['2026-10-02T17:00:00.000Z']);
    expect(busyBandsFromStored(quarters, 'UTC', NOW)).toEqual([]);
  });

  it('serves a half-hour zone exactly', () => {
    // 5–8pm IST is 11:30–14:30 UTC: three of the evening's five hours.
    const quarters = busyQuarters(
      [{ start: Date.parse('2026-10-02T11:30:00Z'), end: Date.parse('2026-10-02T14:30:00Z') }],
      calendarWindow(NOW),
    );
    expect(busyBandsFromStored(quarters, 'Asia/Kolkata', NOW)).toEqual(['2026-10-02T17:00:00.000Z']);
  });

  it('accepts stored rows in PostgREST’s spelling and ignores junk', () => {
    const stored = Array.from({ length: 16 }, (_, i) =>
      new Date(Date.parse('2026-10-02T21:00:00Z') + i * BUSY_STEP_MS).toISOString().replace('.000Z', '+00:00'),
    );
    expect(busyBandsFromStored([...stored, 'not a time'], 'America/New_York', NOW)).toEqual([
      '2026-10-02T17:00:00.000Z',
    ]);
  });

  it.each(['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC'])(
    'reads a window that covers every slot of a %s plan’s week',
    (zone) => {
      for (const hour of [0, 9, 10, 11, 12, 23]) {
        const now = new Date(Date.UTC(2026, 9, 1, hour, 30));
        const window = calendarWindow(now);
        for (const slot of gridSlots(now, GRID_DAYS, zone)) {
          const range = slotRange(slot, zone);
          expect(range.start).toBeGreaterThanOrEqual(window.start);
          expect(range.end).toBeLessThanOrEqual(window.end);
        }
      }
    },
  );
});

describe('upcomingSlotCounts', () => {
  it('keeps only this week’s slots whose start is still ahead', () => {
    // 7pm EDT on Friday 2 October: Friday evening (6pm) has started, Friday
    // late (10pm) has not, and last week's answers are no longer on offer.
    const now = new Date('2026-10-02T23:00:00Z');
    const counts = [
      { slot: '2026-10-02T17:00:00+00:00', people: 4, mine: false },
      { slot: '2026-10-02T22:00:00.000Z', people: 3, mine: false },
      { slot: '2026-09-25T17:00:00.000Z', people: 9, mine: true },
      { slot: 'garbage', people: 1, mine: false },
    ];
    expect(upcomingSlotCounts(counts, 'America/New_York', now).map((entry) => entry.slot)).toEqual([
      '2026-10-02T22:00:00.000Z',
    ]);
  });
});
