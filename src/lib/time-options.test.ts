import { describe, expect, it } from 'vitest';
import {
  HOUR_CHOICES,
  MERIDIEMS,
  TIME_STEP_MINUTES,
  clockToMinutes,
  formatClock,
  joinClock,
  minuteChoices,
  minutesToClock,
  splitClock,
} from './time-options';

describe('clockToMinutes', () => {
  it('reads both zero-padded and bare hours', () => {
    expect(clockToMinutes('00:00')).toBe(0);
    expect(clockToMinutes('09:05')).toBe(545);
    expect(clockToMinutes('9:05')).toBe(545);
    expect(clockToMinutes('23:55')).toBe(1435);
  });

  it('rejects anything that is not a wall-clock time', () => {
    expect(clockToMinutes('')).toBeNull();
    expect(clockToMinutes('24:00')).toBeNull();
    expect(clockToMinutes('12:60')).toBeNull();
    expect(clockToMinutes('noon')).toBeNull();
  });
});

describe('minutesToClock', () => {
  it('round-trips with clockToMinutes', () => {
    expect(minutesToClock(0)).toBe('00:00');
    expect(minutesToClock(545)).toBe('09:05');
    expect(clockToMinutes(minutesToClock(1435))).toBe(1435);
  });

  it('wraps rather than producing an impossible clock', () => {
    expect(minutesToClock(24 * 60)).toBe('00:00');
    expect(minutesToClock(-5)).toBe('23:55');
  });
});

describe('formatClock', () => {
  it('renders 12-hour labels the way people say them', () => {
    expect(formatClock('00:00')).toBe('12:00 AM');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('09:05')).toBe('9:05 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatClock('17:20')).toBe('5:20 PM');
    expect(formatClock('23:55')).toBe('11:55 PM');
  });

  it('is empty for a non-time, so a blank field stays blank', () => {
    expect(formatClock('')).toBe('');
  });
});

describe('HOUR_CHOICES', () => {
  it('is the twelve hours of a clock face, midnight first', () => {
    expect(HOUR_CHOICES).toHaveLength(12);
    expect(HOUR_CHOICES[0]).toBe(12);
    expect(HOUR_CHOICES.at(-1)).toBe(11);
    expect([...HOUR_CHOICES].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
});

describe('minuteChoices', () => {
  it('covers the hour in five-minute steps — twelve rows, not 288', () => {
    const choices = minuteChoices();
    expect(choices).toHaveLength(60 / TIME_STEP_MINUTES);
    expect(choices[0]).toBe(0);
    expect(choices.at(-1)).toBe(55);
    for (const minute of choices) expect(minute % TIME_STEP_MINUTES).toBe(0);
  });

  it('leaves the grid alone when the current minute is already on it', () => {
    expect(minuteChoices(20)).toHaveLength(60 / TIME_STEP_MINUTES);
    expect(minuteChoices(0)).toHaveLength(60 / TIME_STEP_MINUTES);
    expect(minuteChoices(null)).toHaveLength(60 / TIME_STEP_MINUTES);
  });

  it('keeps an off-grid minute — an imported plan must not be quietly rescheduled', () => {
    const choices = minuteChoices(47);
    expect(choices).toHaveLength(60 / TIME_STEP_MINUTES + 1);
    const index = choices.indexOf(47);
    expect(choices[index - 1]).toBe(45);
    expect(choices[index + 1]).toBe(50);
  });

  it('keeps an off-grid minute at either end of the hour', () => {
    expect(minuteChoices(1)[1]).toBe(1);
    expect(minuteChoices(59).at(-1)).toBe(59);
  });

  it('ignores a minute that could not have come off a clock', () => {
    expect(minuteChoices(60)).toHaveLength(60 / TIME_STEP_MINUTES);
    expect(minuteChoices(-1)).toHaveLength(60 / TIME_STEP_MINUTES);
    expect(minuteChoices(12.5)).toHaveLength(60 / TIME_STEP_MINUTES);
  });
});

describe('splitClock', () => {
  it('reads a time the way it is spoken', () => {
    expect(splitClock('18:47')).toEqual({ hour12: 6, minute: 47, meridiem: 'PM' });
    expect(splitClock('09:05')).toEqual({ hour12: 9, minute: 5, meridiem: 'AM' });
  });

  it('puts midnight and noon on 12, not on 0', () => {
    expect(splitClock('00:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'AM' });
    expect(splitClock('00:30')).toEqual({ hour12: 12, minute: 30, meridiem: 'AM' });
    expect(splitClock('12:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'PM' });
    expect(splitClock('12:59')).toEqual({ hour12: 12, minute: 59, meridiem: 'PM' });
  });

  it('is null for an empty or unreadable field, so nothing is invented', () => {
    expect(splitClock('')).toBeNull();
    expect(splitClock('24:00')).toBeNull();
    expect(splitClock('half seven')).toBeNull();
  });
});

describe('joinClock', () => {
  it('round-trips every time the pickers can produce', () => {
    for (const hour12 of HOUR_CHOICES) {
      for (const meridiem of MERIDIEMS) {
        for (let minute = 0; minute < 60; minute += 1) {
          const clock = joinClock({ hour12, minute, meridiem });
          expect(splitClock(clock)).toEqual({ hour12, minute, meridiem });
        }
      }
    }
  });

  it('round-trips from the other side too — every minute of the day', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      const clock = minutesToClock(minutes);
      expect(joinClock(splitClock(clock)!)).toBe(clock);
    }
  });

  it('reads 12 as midnight in the morning and noon in the afternoon', () => {
    expect(joinClock({ hour12: 12, minute: 0, meridiem: 'AM' })).toBe('00:00');
    expect(joinClock({ hour12: 12, minute: 0, meridiem: 'PM' })).toBe('12:00');
  });

  it('wraps an hour off the face rather than producing an impossible clock', () => {
    expect(joinClock({ hour12: 0, minute: 0, meridiem: 'AM' })).toBe('00:00');
    expect(joinClock({ hour12: 13, minute: 0, meridiem: 'AM' })).toBe('01:00');
  });
});
