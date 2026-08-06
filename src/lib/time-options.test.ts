import { describe, expect, it } from 'vitest';
import {
  TIME_STEP_MINUTES,
  clockToMinutes,
  formatClock,
  minutesToClock,
  timeOptions,
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

describe('timeOptions', () => {
  it('covers the whole day in five-minute steps', () => {
    const options = timeOptions();
    expect(options).toHaveLength((24 * 60) / TIME_STEP_MINUTES);
    expect(options[0]).toEqual({ value: '00:00', label: '12:00 AM' });
    expect(options[1].value).toBe('00:05');
    expect(options.at(-1)).toEqual({ value: '23:55', label: '11:55 PM' });
    for (const option of options) {
      expect(clockToMinutes(option.value)! % TIME_STEP_MINUTES).toBe(0);
    }
  });

  it('leaves the grid alone when the current value is already on it', () => {
    expect(timeOptions('17:20')).toHaveLength((24 * 60) / TIME_STEP_MINUTES);
    expect(timeOptions('')).toHaveLength((24 * 60) / TIME_STEP_MINUTES);
    expect(timeOptions(null)).toHaveLength((24 * 60) / TIME_STEP_MINUTES);
  });

  it('keeps an off-grid time — an imported plan must not be quietly rescheduled', () => {
    const options = timeOptions('18:47');
    expect(options).toHaveLength((24 * 60) / TIME_STEP_MINUTES + 1);
    const index = options.findIndex((o) => o.value === '18:47');
    expect(options[index - 1].value).toBe('18:45');
    expect(options[index].label).toBe('6:47 PM');
    expect(options[index + 1].value).toBe('18:50');
  });

  it('keeps an off-grid time at either end of the day', () => {
    expect(timeOptions('00:01')[1]).toEqual({ value: '00:01', label: '12:01 AM' });
    expect(timeOptions('23:59').at(-1)).toEqual({ value: '23:59', label: '11:59 PM' });
  });
});
