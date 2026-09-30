import { describe, expect, it } from 'vitest';
import { localDate, ritualDueLabel, ritualIsDue, ritualReminderNotice } from './rituals';

describe('localDate', () => {
  const late = new Date('2026-09-30T02:30:00Z');

  it('is the date where the person is, not where the server is', () => {
    expect(localDate('UTC', late)).toBe('2026-09-30');
    expect(localDate('America/Los_Angeles', late)).toBe('2026-09-29');
    expect(localDate('Pacific/Auckland', late)).toBe('2026-09-30');
  });

  it('reads an unknown or missing zone as UTC rather than throwing', () => {
    expect(localDate('Not/AZone', late)).toBe('2026-09-30');
    expect(localDate(null, late)).toBe('2026-09-30');
  });
});

describe('ritualIsDue', () => {
  it('is due on and after its date, while active', () => {
    expect(ritualIsDue({ status: 'active', due_on: '2026-09-29' }, '2026-09-29')).toBe(true);
    expect(ritualIsDue({ status: 'active', due_on: '2026-09-01' }, '2026-09-29')).toBe(true);
    expect(ritualIsDue({ status: 'active', due_on: '2026-09-30' }, '2026-09-29')).toBe(false);
  });

  it('is never due while proposed, paused or ended', () => {
    for (const status of ['proposed', 'paused', 'ended']) {
      expect(ritualIsDue({ status, due_on: '2026-09-01' }, '2026-09-29'), status).toBe(false);
    }
    expect(ritualIsDue({ status: 'active', due_on: null }, '2026-09-29')).toBe(false);
  });
});

describe('ritualDueLabel', () => {
  it('reads the way people say it', () => {
    expect(ritualDueLabel('2026-09-29', '2026-09-29')).toBe('due now');
    expect(ritualDueLabel('2026-09-20', '2026-09-29')).toBe('due now');
    expect(ritualDueLabel('2026-09-30', '2026-09-29')).toBe('due tomorrow');
    expect(ritualDueLabel('2026-10-20', '2026-09-29')).toBe('due Oct 20');
  });
});

describe('ritualReminderNotice', () => {
  it('names the activity and the other person, and offers both ways out', () => {
    const notice = ritualReminderNotice('Coffee', 'Pat');
    expect(notice.body).toBe('Time for coffee with Pat. Plan it, or skip this one.');
    expect(notice.url).toBe('/mutual');
  });

  it('still reads without a name', () => {
    expect(ritualReminderNotice('Climbing', null).body).toContain('with your friend');
  });
});
