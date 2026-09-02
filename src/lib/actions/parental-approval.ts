'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { checkEventManager, isEventManager } from '@/lib/server/authz';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { failure, validation, type ActionResult, type ErrorCode } from '@/lib/errors';
import { looksLikeEmail, sendEmails } from '@/lib/server/email';
import { approvalUrl } from '@/lib/links';
import { checkRateLimit } from '@/lib/server/rate-limit';

const APPROVAL_REQUEST_LIMIT = 5;
const APPROVAL_REQUEST_WINDOW_SECONDS = 60 * 60;

export interface RequestApprovalInput {
  inviteId: string;
  eventId: string;
  guardianEmail: string;
  guardianName?: string;
}

export async function requestParentalApproval(
  input: RequestApprovalInput,
): Promise<ActionResult & { approvalId?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const guardianEmail = input.guardianEmail.trim().toLowerCase();
  const guardianName = input.guardianName?.trim() || null;
  if (!looksLikeEmail(guardianEmail)) {
    return validation('Enter a valid email address for the guardian.');
  }

  // This read runs as the caller, so RLS is part of the authorization boundary.
  // The explicit identity + event checks remain necessary: a host can also read
  // invites for their plan, but only the invitee may create the first guardian
  // request. The host recovery path below is deliberately separate.
  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('id, event_id, invitee_id')
    .eq('id', input.inviteId)
    .eq('event_id', input.eventId)
    .maybeSingle<{ id: string; event_id: string; invitee_id: string | null }>();
  if (inviteError) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.invite',
      inviteError,
      { eventId: input.eventId },
      'Could not verify this RSVP. Try again.',
    );
  }
  if (
    !invite ||
    invite.invitee_id !== user.id ||
    invite.event_id !== input.eventId
  ) {
    return failure('SB-RSVP-GUARDIAN');
  }

  // Keep the event read under the caller's RLS session too. No service-role
  // access occurs until the exact invite, event, and caller are tied together.
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, parental_approval')
    .eq('id', input.eventId)
    .maybeSingle<{ id: string; title: string; parental_approval: boolean }>();
  if (eventError) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.event',
      eventError,
      { eventId: input.eventId },
      'Could not verify this plan. Try again.',
    );
  }
  if (!event) return failure('SB-RSVP-GONE', 'This plan is no longer available.');
  if (!event.parental_approval) {
    return validation('This plan does not require parental approval.');
  }

  if (
    !(await checkRateLimit(
      `parental-approval:${user.id}`,
      APPROVAL_REQUEST_LIMIT,
      APPROVAL_REQUEST_WINDOW_SECONDS,
    ))
  ) {
    return failure('SB-RATE-LIMIT');
  }

  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from('parental_approvals')
    .select('id')
    .eq('invite_id', input.inviteId)
    .maybeSingle();
  if (existingError) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.create',
      existingError,
      { eventId: input.eventId },
      'Could not check the approval request. Try again.',
    );
  }
  if (existing) {
    return failure(
      'SB-RSVP-APPROVAL',
      'An approval request has already been sent for this RSVP.',
    );
  }

  const { data: approval, error } = await admin
    .from('parental_approvals')
    .insert({
      invite_id: input.inviteId,
      event_id: input.eventId,
      guardian_email: guardianEmail,
      guardian_name: guardianName,
    })
    .select('id, token')
    .single<{ id: string; token: string }>();

  if (error || !approval) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.create',
      error ?? 'Missing approval row',
      { eventId: input.eventId },
      'Could not send the approval request. Try again.',
    );
  }

  await deliverGuardianApproval({
    eventId: input.eventId,
    eventTitle: event.title,
    guardianEmail,
    guardianName,
    token: approval.token,
  });

  revalidatePath(`/events/${input.eventId}`);
  return { ok: true, approvalId: approval.id };
}

export interface ResendApprovalInput {
  inviteId: string;
  eventId: string;
  guardianEmail: string;
  guardianName?: string;
}

/**
 * Host recovery for a pending guardian request.
 *
 * This is intentionally not folded into `requestParentalApproval`: the first
 * request must be bound to the invitee's own RLS-visible row, while a host needs
 * a separately authorized way to correct a mistyped/pre-empted address and
 * resend the existing capability without minting a second approval.
 */
export async function resendParentalApproval(
  input: ResendApprovalInput,
): Promise<ActionResult & { approvalId?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;

  const guardianEmail = input.guardianEmail.trim().toLowerCase();
  const guardianName = input.guardianName?.trim() || null;
  if (!looksLikeEmail(guardianEmail)) {
    return validation('Enter a valid email address for the guardian.');
  }

  const manager = await checkEventManager(user.id, input.eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) return failure('SB-PERM-DENIED');

  if (
    !(await checkRateLimit(
      `parental-approval:${user.id}`,
      APPROVAL_REQUEST_LIMIT,
      APPROVAL_REQUEST_WINDOW_SECONDS,
    ))
  ) {
    return failure('SB-RATE-LIMIT');
  }

  // The service-role reads and write below are safe only after the manager
  // check above, and every query is re-scoped to the exact event + invite.
  const admin = createAdminClient();
  const [{ data: approval, error: approvalError }, { data: event, error: eventError }] =
    await Promise.all([
      admin
        .from('parental_approvals')
        .select('id, token')
        .eq('event_id', input.eventId)
        .eq('invite_id', input.inviteId)
        .eq('status', 'pending')
        .maybeSingle<{ id: string; token: string }>(),
      admin
        .from('events')
        .select('id, title, parental_approval')
        .eq('id', input.eventId)
        .maybeSingle<{ id: string; title: string; parental_approval: boolean }>(),
    ]);

  if (approvalError || eventError) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.resend',
      approvalError ?? eventError ?? 'Guardian approval lookup failed',
      { eventId: input.eventId },
      'Could not prepare the guardian request. Try again.',
    );
  }
  if (!event || !event.parental_approval) {
    return failure('SB-RSVP-GONE', 'This plan no longer requires guardian approval.');
  }
  if (!approval) {
    return failure(
      'SB-RSVP-APPROVAL',
      'There is no pending guardian request for this RSVP.',
    );
  }

  const { data: updated, error: updateError } = await admin
    .from('parental_approvals')
    .update({ guardian_email: guardianEmail, guardian_name: guardianName })
    .eq('id', approval.id)
    .eq('event_id', input.eventId)
    .eq('invite_id', input.inviteId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle<{ id: string }>();
  if (updateError || !updated) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.resend',
      updateError ?? 'Pending guardian approval changed before resend',
      { eventId: input.eventId },
      'Could not update the guardian request. Refresh and try again.',
    );
  }

  await deliverGuardianApproval({
    eventId: input.eventId,
    eventTitle: event.title,
    guardianEmail,
    guardianName,
    token: approval.token,
  });

  revalidatePath(`/events/${input.eventId}`);
  return { ok: true, approvalId: approval.id };
}

async function deliverGuardianApproval(input: {
  eventId: string;
  eventTitle: string;
  guardianEmail: string;
  guardianName: string | null;
  token: string;
}): Promise<void> {
  const link = approvalUrl(input.token);
  try {
    await sendEmails([
      {
        to: input.guardianEmail,
        subject: `Approval needed: ${input.eventTitle} on Switchboard`,
        text: [
          `Hi${input.guardianName ? ` ${input.guardianName}` : ''},`,
          '',
          `Someone has RSVP'd to "${input.eventTitle}" on Switchboard, and the host has asked that a parent or guardian approve their attendance.`,
          '',
          'To approve or deny, open this link:',
          link,
          '',
          'If you did not expect this, you can safely ignore it.',
          '',
          '- Switchboard',
        ].join('\n'),
      },
    ]);
  } catch (emailError) {
    await reportOperationalError('parental-approval.email', emailError, {
      eventId: input.eventId,
    });
  }
}

export interface ResolveApprovalResult {
  ok: boolean;
  outcome?: string;
  eventTitle?: string;
  error?: string;
  code?: ErrorCode;
  fix?: string | null;
}

export async function resolveParentalApproval(
  token: string,
  approve: boolean,
): Promise<ResolveApprovalResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('resolve_parental_approval', {
    p_token: token,
    p_approve: approve,
  });

  if (error) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.resolve',
      error,
      {},
      'Could not process the approval. Try again.',
    );
  }

  const row = typeof data === 'object' && data !== null ? data : {};
  const outcome = (row as Record<string, unknown>).outcome as string | undefined;
  const eventTitle = (row as Record<string, unknown>).event_title as string | undefined;

  if (
    outcome === 'not_found' ||
    outcome === 'event_gone' ||
    outcome === 'invite_gone' ||
    outcome === 'invite_mismatch'
  ) {
    return {
      ...failure('SB-LINK-UNKNOWN', 'This approval link is not valid.'),
      outcome,
    };
  }

  if (outcome === 'already_resolved') {
    const status = (row as Record<string, unknown>).status as string;
    return {
      ok: true,
      outcome: 'already_resolved',
      eventTitle,
      error: `This has already been ${status}.`,
    };
  }

  if (outcome === 'approved') {
    const eventId = await eventIdForApprovalToken(admin, token);
    if (eventId) {
      await advanceEventCascade(eventId);

      const { data: event } = await admin
        .from('events')
        .select('host_id')
        .eq('id', eventId)
        .maybeSingle<{ host_id: string }>();
      if (event) {
        await notifyUsers([event.host_id], {
          kind: 'parental_approval',
          title: 'Guardian approved',
          body: `A guardian approved attendance for ${eventTitle ?? 'your plan'}.`,
          url: `/events/${eventId}`,
        });
      }
      revalidatePath(`/events/${eventId}`);
    }
  }

  if (outcome === 'denied') {
    const eventId = await eventIdForApprovalToken(admin, token);
    if (eventId) {
      await advanceEventCascade(eventId);

      const { data: event } = await admin
        .from('events')
        .select('host_id')
        .eq('id', eventId)
        .maybeSingle<{ host_id: string }>();
      if (event) {
        await notifyUsers([event.host_id], {
          kind: 'parental_approval_denied',
          title: 'Guardian denied',
          body: `A guardian denied attendance for ${eventTitle ?? 'your plan'}.`,
          url: `/events/${eventId}`,
        });
      }
      revalidatePath(`/events/${eventId}`);
    }
  }

  return { ok: true, outcome, eventTitle };
}

async function eventIdForApprovalToken(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<string | null> {
  const { data } = await admin
    .from('parental_approvals')
    .select('event_id')
    .eq('token', token)
    .maybeSingle<{ event_id: string }>();
  return data?.event_id ?? null;
}
export async function toggleParentalApproval(
  eventId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  if (!(await isEventManager(user.id, eventId))) {
    return failure('SB-PERM-HOST', 'Only the host can change this.');
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .update({ parental_approval: enabled })
    .eq('id', eventId);
  if (error) {
    return reportAndFail(
      'SB-PLAN-SAVE',
      'event-update',
      error,
      { eventId },
      'Could not update parental approval. Try again.',
    );
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
