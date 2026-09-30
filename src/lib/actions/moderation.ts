'use server';

import { validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';
import { isSuspensionDays } from '@/lib/suspension';

/*
 * Every action here runs under the moderator's own session client. The
 * database is the authority: each RPC is a security-definer function that
 * re-checks `is_platform_moderator(auth.uid())` and raises for anyone else,
 * and every suspension or removal must name an open report about exactly that
 * account, post or message (20260930070000_moderator_actions.sql). Nothing
 * here uses the service-role client, so there is nothing to re-authorize.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 500;

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim().slice(0, NOTE_MAX);
  return trimmed || undefined;
}

function done(): ActionResult {
  revalidatePath('/moderation');
  return { ok: true };
}

/**
 * Resolve or dismiss a user report. Authorization is enforced in the database:
 * resolve_report() is a security-definer function that self-checks
 * is_platform_moderator(auth.uid()) and raises for anyone else, so this action
 * can safely run under the caller's RLS client.
 */
export async function resolveReport(
  reportId: string,
  status: 'resolved' | 'dismissed',
  note: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { error } = await supabase.rpc('resolve_report', {
    p_report: reportId,
    p_status: status,
    p_note: note.trim() || undefined,
  });
  if (error) return reportAndFail('SB-MODERATION-SAVE', 'moderation.resolve', error, { reportId });
  revalidatePath('/moderation');
  return { ok: true };
}

/**
 * Suspend the account a report is about. The suspension is the auth server's
 * own ban, so the person's next sign-in, page load or action is refused with
 * SB-AUTH-SUSPENDED and the support address (docs/AUTH.md). `days: null`
 * lasts until a moderator lifts it.
 */
export async function suspendReportedAccount(
  reportId: string,
  memberId: string,
  days: number | null,
  note?: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(reportId) || !UUID_RE.test(memberId)) {
    return validation('That report is no longer in the queue. Reload it.');
  }
  if (!isSuspensionDays(days)) return validation('Choose how long the suspension lasts.');

  const auth = await requireUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc('moderate_suspend_account', {
    p_member: memberId,
    p_report: reportId,
    p_days: days ?? undefined,
    p_note: cleanNote(note),
  });
  if (error) {
    return reportAndFail('SB-MODERATION-SUSPEND', 'moderation.suspend', error, { reportId });
  }
  switch (data) {
    case 'suspended':
      return done();
    case 'self':
      return validation('You can’t suspend your own account.');
    case 'moderator':
      return validation(
        'Moderators can’t be suspended from here. Whoever runs Switchboard has to remove their moderator role first.',
      );
    case 'not_found':
      return validation('That account has been deleted, so there is nothing to suspend.');
    default:
      return reportAndFail('SB-MODERATION-SUSPEND', 'moderation.suspend', {
        message: `unexpected outcome: ${String(data)}`,
      }, { reportId });
  }
}

/** Lift a suspension early, whether it was set here or outside the app. */
export async function liftSuspension(memberId: string, note?: string): Promise<ActionResult> {
  if (!UUID_RE.test(memberId)) return validation('That account is no longer listed. Reload.');

  const auth = await requireUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc('moderate_lift_suspension', {
    p_member: memberId,
    p_note: cleanNote(note),
  });
  if (error) return reportAndFail('SB-MODERATION-SUSPEND', 'moderation.lift', error, { memberId });
  // Already lifted (or already run out) is the state the moderator asked for.
  if (data === 'lifted' || data === 'not_suspended') return done();
  return reportAndFail('SB-MODERATION-SUSPEND', 'moderation.lift', {
    message: `unexpected outcome: ${String(data)}`,
  }, { memberId });
}

/**
 * Take a reported board post down. It disappears for the board's members and
 * stays in the report, marked removed, so the decision can still be read.
 */
export async function removeReportedPost(
  reportId: string,
  postId: string,
  note?: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(reportId) || !UUID_RE.test(postId)) {
    return validation('That report is no longer in the queue. Reload it.');
  }

  const auth = await requireUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc('moderate_remove_board_post', {
    p_post: postId,
    p_report: reportId,
    p_note: cleanNote(note),
  });
  if (error) {
    return reportAndFail('SB-MODERATION-REMOVE', 'moderation.remove-post', error, { reportId });
  }
  if (data === 'removed' || data === 'already_removed') return done();
  if (data === 'not_found') return validation('Its author already deleted that post.');
  return reportAndFail('SB-MODERATION-REMOVE', 'moderation.remove-post', {
    message: `unexpected outcome: ${String(data)}`,
  }, { reportId });
}

/**
 * Take a reported room message down, with anything it filed into the room's
 * tabs. The report keeps the words and the photo for the record.
 */
export async function removeReportedMessage(
  reportId: string,
  messageId: string,
  note?: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(reportId) || !UUID_RE.test(messageId)) {
    return validation('That report is no longer in the queue. Reload it.');
  }

  const auth = await requireUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc('moderate_remove_room_message', {
    p_message: messageId,
    p_report: reportId,
    p_note: cleanNote(note),
  });
  if (error) {
    return reportAndFail('SB-MODERATION-REMOVE', 'moderation.remove-message', error, { reportId });
  }
  if (data === 'removed' || data === 'already_removed') return done();
  if (data === 'not_found') return validation('Its sender already deleted that message.');
  return reportAndFail('SB-MODERATION-REMOVE', 'moderation.remove-message', {
    message: `unexpected outcome: ${String(data)}`,
  }, { reportId });
}
