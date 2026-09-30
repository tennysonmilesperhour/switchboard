/**
 * The parts of a plan the host can change after creating it, beyond the
 * details (decision D18): the cover, the theme, reminders, Open Table, and new
 * questions. Pure and shared, so the edit form refuses exactly what the server
 * refuses. Parental approval and recurrence are not here on purpose: they stay
 * as the plan was made, and the database holds that
 * (`events_freeze_founding_rules`).
 */

import { EVENT_THEMES } from './themes';
import type { EventTheme } from './types';

/**
 * What reminders actually do, in one sentence for every place the toggle
 * appears. It used to say "a few hours ahead", while the sweep sends a note the
 * day before (with a nudge to anyone still holding an invitation) and a
 * starting-soon ping in the last three hours (`dueReminders`, G25).
 */
export const REMINDER_SCHEDULE_COPY =
  'A note the day before to everyone who said yes, a nudge to anyone who hasn’t answered yet, and a starting-soon ping about three hours out.';

/** The most questions a plan asks — the wizard's limit, kept on edit. */
export const MAX_PLAN_QUESTIONS = 5;
/** The same bounds `create_event_atomic` and the table's CHECKs apply. */
const MAX_PROMPT = 200;
const MAX_OPTION = 120;
const MAX_OPTIONS = 10;

export interface NewQuestion {
  prompt: string;
  required: boolean;
  kind: 'text' | 'choice';
  options: string[];
}

/**
 * Clean the questions a host is adding: trimmed and capped, blank ones and
 * blank options dropped, and a choice question with fewer than two options
 * asked as free text (the wizard's rule).
 */
export function normalizeNewQuestions(input: readonly NewQuestion[]): NewQuestion[] {
  return input
    .map((question) => {
      const options = question.options
        .map((option) => option.trim().slice(0, MAX_OPTION))
        .filter((option) => option.length > 0)
        .slice(0, MAX_OPTIONS);
      const isChoice = question.kind === 'choice' && options.length >= 2;
      return {
        prompt: question.prompt.trim().slice(0, MAX_PROMPT),
        required: Boolean(question.required),
        kind: isChoice ? ('choice' as const) : ('text' as const),
        options: isChoice ? options : [],
      };
    })
    .filter((question) => question.prompt.length > 0);
}

/**
 * Why the extras can't be saved as given, or null. Reader-fixable sentences,
 * so none carries a code.
 */
export function planExtrasProblem(input: {
  openTable: boolean;
  capacity: number | null;
  theme: string;
  existingQuestions: number;
  newQuestions: number;
}): string | null {
  // An Open Table offers the seats the plan has left; `list_open_tables` shows
  // only plans with a capacity, and the wizard never lets one open without it.
  if (input.openTable && !input.capacity) {
    return 'Open Table needs a capacity, so there are seats to offer. Add one, or turn Open Table off.';
  }
  if (!isEventTheme(input.theme)) return 'Pick one of the themes shown.';
  if (input.existingQuestions + input.newQuestions > MAX_PLAN_QUESTIONS) {
    return `A plan can ask up to ${MAX_PLAN_QUESTIONS} questions.`;
  }
  return null;
}

export function isEventTheme(value: string): value is EventTheme {
  return EVENT_THEMES.some((theme) => theme.id === value);
}
