'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { isEventManager } from '@/lib/server/authz';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { failure, type ActionResult, type ErrorCode } from '@/lib/errors';
import { looksLikeEmail, sendEmails } from '@/lib/server/email';
import { approvalUrl } from '@/lib/links';

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

  const guardianEmail = input.guardianEmail.trim().toLowerCase();
  if (!looksLikeEmail(guardianEmail)) {
    return { ok: false, error: 'Enter a valid email address for the guardian.' };
  }

  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select('id, title, parental_approval')
    .eq('id', input.eventId)
    .maybeSingle<{ id: string; title: string; parental_approval: boolean }>();
  if (!event) return { ok: false, error: 'Plan not found.' };
  if (!event.parental_approval) {
    return { ok: false, error: 'This plan does not require parental approval.' };
  }

  const { data: existing } = await admin
    .from('parental_approvals')
    .select('id')
    .eq('invite_id', input.inviteId)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: 'An approval request has already been sent for this RSVP.' };
  }

  const { data: approval, error } = await admin
    .from('parental_approvals')
    .insert({
      invite_id: input.inviteId,
      event_id: input.eventId,
      guardian_email: guardianEmail,
      guardian_name: input.guardianName?.trim() || null,
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

  const link = approvalUrl(approval.token);
  try {
    await sendEmails([
      {
        to: guardianEmail,
        subject: `Approval needed: ${event.title} on Switchboard`,
        text: [
          `Hi${input.guardianName ? ` ${input.guardianName.trim()}` : ''},`,
          '',
          `Someone has RSVP'd to "${event.title}" on Switchboard, and the host has asked that a parent or guardian approve their attendance.`,
          '',
          `To approve or deny, open this link:`,
          link,
          '',
          `If you did not expect this, you can safely ignore it.`,
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

  revalidatePath(`/events/${input.eventId}`);
  return { ok: true, approvalId: approval.id };
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

  if (outcome === 'not_found') {
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
    const inviteStatus = (row as Record<string, unknown>).invite_status as string | undefined;
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
    return { ok: false, error: 'Only the host can change this.' };
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
