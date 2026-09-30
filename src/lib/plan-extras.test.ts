import { describe, expect, it } from 'vitest';
import {
  MAX_PLAN_QUESTIONS,
  REMINDER_SCHEDULE_COPY,
  isEventTheme,
  normalizeNewQuestions,
  planExtrasProblem,
} from './plan-extras';
import { dueReminders } from './server/reminders';

const HOUR = 3_600_000;

describe('REMINDER_SCHEDULE_COPY (G25)', () => {
  /**
   * The copy names two moments; the sweep has exactly two. If either moves,
   * this fails until the sentence moves with it.
   */
  it('describes the schedule the sweep actually runs', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const event = (hoursOut: number) => ({
      starts_at: new Date(now.getTime() + hoursOut * HOUR).toISOString(),
      status: 'inviting',
      reminders_enabled: true,
      reminded_day_before_at: null,
      reminded_soon_at: null,
    });
    expect(dueReminders(event(20), now)).toEqual(['day_before']);
    expect(dueReminders(event(2.5), now)).toEqual(['soon']);
    expect(dueReminders(event(3.5), now)).toEqual(['day_before']);
    expect(REMINDER_SCHEDULE_COPY).toMatch(/the day before/);
    expect(REMINDER_SCHEDULE_COPY).toMatch(/three hours/);
    expect(REMINDER_SCHEDULE_COPY).not.toMatch(/few hours ahead/);
  });
});

describe('normalizeNewQuestions', () => {
  it('drops blanks and keeps a real choice question', () => {
    expect(
      normalizeNewQuestions([
        { prompt: '  ', required: true, kind: 'text', options: [] },
        { prompt: ' Bringing? ', required: false, kind: 'choice', options: ['Chips', ' ', 'Dip'] },
      ]),
    ).toEqual([{ prompt: 'Bringing?', required: false, kind: 'choice', options: ['Chips', 'Dip'] }]);
  });

  it('asks a choice question with one option as free text', () => {
    expect(
      normalizeNewQuestions([{ prompt: 'Diet?', required: true, kind: 'choice', options: ['None', ''] }]),
    ).toEqual([{ prompt: 'Diet?', required: true, kind: 'text', options: [] }]);
  });

  it('caps prompts at the table’s limit', () => {
    const [question] = normalizeNewQuestions([
      { prompt: 'x'.repeat(500), required: false, kind: 'text', options: [] },
    ]);
    expect(question.prompt.length).toBe(200);
  });
});

describe('planExtrasProblem', () => {
  const ok = { openTable: false, capacity: null, theme: 'default', existingQuestions: 0, newQuestions: 0 };

  it('accepts an ordinary edit', () => {
    expect(planExtrasProblem(ok)).toBeNull();
  });

  it('needs a capacity for Open Table, as the wizard does', () => {
    expect(planExtrasProblem({ ...ok, openTable: true })).toMatch(/capacity/);
    expect(planExtrasProblem({ ...ok, openTable: true, capacity: 6 })).toBeNull();
  });

  it('refuses a theme the table does not know', () => {
    expect(planExtrasProblem({ ...ok, theme: 'neon' })).toMatch(/theme/);
    expect(isEventTheme('dusk')).toBe(true);
  });

  it('keeps the wizard’s question limit on edit', () => {
    expect(
      planExtrasProblem({ ...ok, existingQuestions: MAX_PLAN_QUESTIONS - 1, newQuestions: 2 }),
    ).toMatch(/up to 5 questions/);
    expect(
      planExtrasProblem({ ...ok, existingQuestions: MAX_PLAN_QUESTIONS - 1, newQuestions: 1 }),
    ).toBeNull();
  });
});
