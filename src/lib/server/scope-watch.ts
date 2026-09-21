import { sendEmail, appUrl, emailEnabled } from '@/lib/server/email';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportOperationalError } from '@/lib/server/observability';

/**
 * Telling the owner that the client did something on the scope checklist.
 *
 * The complaint this answers: she walked the list, wrote notes, and nobody was
 * told. Ticks never left her browser, and notes landed in a table with no read
 * path, so the first anyone heard of either was when she mentioned it.
 *
 * Two kinds of change, deliberately handled differently:
 *
 *   * **A note** is rare and substantive, so it goes out immediately and in
 *     full. Missing one costs more than an extra email.
 *   * **A tick** is one of thirty-five, and someone working through the list
 *     produces a burst of them. Sending on each would train the address to be
 *     filtered, which loses the notes too. So progress is debounced to at most
 *     one message an hour, and that message reports where the list stands rather
 *     than which box just moved.
 *
 * The debounce is the existing Postgres rate limiter used backwards: one "token"
 * per hour, and a refusal means "already told them recently", not an error. That
 * keeps the window durable across serverless invocations, which an in-process
 * timer could not.
 *
 * Every path here is best-effort. A notification that fails must never fail the
 * write that triggered it — the client's words matter more than the telling.
 */

/** Where to write. Server-only; unset means the feature is simply off. */
function watcher(): string | null {
  const to = process.env.SCOPE_WATCH_EMAIL?.trim();
  return to && to.includes('@') ? to : null;
}

/** Shared preamble, so every one of these mails is recognisable at a glance. */
const SUBJECT_PREFIX = 'Scope checklist';

function checklistLink(): string {
  return appUrl('/scope-verification');
}

async function deliver(subject: string, text: string): Promise<void> {
  const to = watcher();
  if (!to) return;
  if (!emailEnabled()) return;
  try {
    await sendEmail({ to, subject, text });
  } catch (error) {
    // Best effort. Report it so a silently broken notifier is visible in the
    // logs rather than presenting as "she never touched it".
    await reportOperationalError('scope-watch', error, { subject });
  }
}

export interface FeedbackNotice {
  body: string;
  reporter: string | null;
  itemId: string | null;
  itemLabel: string | null;
  screenshots: number;
}

/**
 * A new note arrived. Sent in full, immediately: the whole point is that the
 * owner should not have to go looking.
 */
export async function notifyNewFeedback(notice: FeedbackNotice): Promise<void> {
  const who = notice.reporter ? notice.reporter : 'Someone';
  const about = notice.itemId
    ? `${notice.itemId} — ${notice.itemLabel ?? 'a checklist item'}`
    : 'the checklist in general';

  const lines = [
    `${who} left a note on the scope checklist.`,
    '',
    `About: ${about}`,
    '',
    notice.body,
    '',
    notice.screenshots > 0
      ? `${notice.screenshots} screenshot${notice.screenshots === 1 ? '' : 's'} attached — visible on the page.`
      : 'No screenshots.',
    '',
    checklistLink(),
  ];

  await deliver(`${SUBJECT_PREFIX}: ${who} left a note`, lines.join('\n'));
}

/**
 * Progress moved. Debounced, and reports the standing total rather than the
 * single box, because the interesting fact is "she's most of the way through",
 * not "item J4 changed".
 *
 * `force` skips the debounce; nothing uses it in the app, it exists so a test
 * can assert the message itself without depending on limiter state.
 */
export async function notifyProgress(
  summary: { checked: number; total: number; lastBy: string | null },
  options: { force?: boolean } = {},
): Promise<'sent' | 'debounced' | 'off'> {
  if (!watcher() || !emailEnabled()) return 'off';

  if (!options.force) {
    // One per hour. `false` here means we already sent one inside the window.
    const firstThisHour = await checkRateLimit('scope-watch:progress', 1, 60 * 60);
    if (!firstThisHour) return 'debounced';
  }

  const { checked, total, lastBy } = summary;
  const left = Math.max(total - checked, 0);
  const who = lastBy ? `Last change by ${lastBy}.` : '';

  const lines = [
    `The scope checklist is at ${checked} of ${total}.`,
    left === 0
      ? 'That is the whole list.'
      : `${left} item${left === 1 ? '' : 's'} still unchecked.`,
    who,
    '',
    checklistLink(),
  ].filter((line) => line !== '');

  await deliver(
    `${SUBJECT_PREFIX}: ${checked}/${total} checked off`,
    lines.join('\n'),
  );
  return 'sent';
}
