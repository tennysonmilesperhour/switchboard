/**
 * Sabbatical mode (completion plan P6, decision D6).
 *
 * A sabbatical mutes everything except what a plan the person is already in
 * says to them. This module is the one answer to "does this reach someone on
 * sabbatical?", shared by the push gate (`sendPushToUsers`) and the daily
 * digest. Texts and emails are held in the database by
 * `private.sabbatical_allows`, which lists the same kinds in SQL;
 * `sabbatical.test.ts` reads that migration and fails if the two disagree.
 *
 * Muting follows the same rule as a category switch or quiet hours: the in-app
 * row is still written, so a muted notification waits in the inbox without a
 * buzz, a text or an email. It is an allowlist, so a new kind stays muted for
 * someone on sabbatical until somebody decides otherwise.
 */

/** The notification kinds that still reach someone on sabbatical. */
export const SABBATICAL_KINDS: ReadonlySet<string> = new Set([
  // A plan you are in changed, was called off, or got its date.
  'event_updated',
  'event_urgent_change',
  'event_cancelled',
  'event_date_set',
  // What its host or its guests say to you.
  'announcement',
  'event_comment',
  'room_message',
  'rsvp_declined_note',
  // Reminders for what you said yes to. (Not `poll_opened`: a new plan that
  // starts as a vote uses it to ask people who are not in yet.)
  'reminder',
  // Your own place in a plan: let in, or a guardian's answer.
  'join_approved',
  'parental_approval',
  'parental_approval_denied',
]);

export interface SabbaticalContext {
  /**
   * For `room_message`: whether the room is a plan's own room. A match or
   * moment room is not a plan you are in, so its messages wait in the inbox.
   * Unknown (undefined) counts as not a plan room.
   */
  planRoom?: boolean;
}

/** Whether a notification of this kind still reaches someone on sabbatical. */
export function sabbaticalAllows(
  kind: string | null | undefined,
  context: SabbaticalContext = {},
): boolean {
  if (!kind || !SABBATICAL_KINDS.has(kind)) return false;
  if (kind === 'room_message') return context.planRoom === true;
  return true;
}

/** Someone's sabbatical, as other people see it. */
export interface SabbaticalStatus {
  /** Their own note, as they wrote it. Plain text: render it as text only. */
  note: string | null;
}

/** Read a profile row's sabbatical columns; null when they are not on one. */
export function sabbaticalOf(
  row: { sabbatical?: boolean | null; sabbatical_message?: string | null } | null | undefined,
): SabbaticalStatus | null {
  if (!row?.sabbatical) return null;
  const note = row.sabbatical_message?.trim();
  return { note: note ? note : null };
}
