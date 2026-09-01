import { describe, expect, it } from 'vitest';

import {
  BANDS,
  GRID_DAYS,
  bestSlots,
  gridSlots,
  heatLevel,
  isGridSlot,
  recommendAvailability,
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
