'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { checkEventManager } from '@/lib/server/authz';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { failure, validation, type ActionResult, type ErrorCode } from '@/lib/errors';
import { looksLikeEmail, sendEmailWithResult, type DeliveryStatus } from '@/lib/server/email';
import { approvalUrl } from '@/lib/links';
import { isJsonObject } from '@/lib/supabase/json';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { guardianApprovalEmail } from '@/lib/guardian-approval';
import { loadGuardianPlanFacts } from '@/lib/server/guardian-facts';

const APPROVAL_REQUEST_LIMIT = 5;
const APPROVAL_REQUEST_WINDOW_SECONDS = 60 * 60;

type Admin = ReturnType<typeof createAdminClient>;

export interface RequestApprovalInput {
  inviteId: string;
  eventId: string;
  guardianEmail: string;
  guardianName?: string;
}

/**
 * The result of asking a guardian. `approvalId` is present whenever the
 * request was saved, including when the email then failed: the RSVP stays held
 * and the request can be sent again, so a failed send is reported as exactly
 * that rather than as "nothing happened".
 */
export type GuardianRequestResult = ActionResult & { approvalId?: string };

/**
 * The invitee asks their guardian — the first time, or again.
 *
 * Only for a yes that is actually being held (`pending_approval`). Sending
 * again re-uses the pending request and rotates its token, the same way the
 * host's resend does: a mistyped address, or an email that never arrived, is
 * corrected without leaving a second live link behind. The guardian may still
 * approve from the newest email only.
 */
export async function requestParentalApproval(
  input: RequestApprovalInput,
): Promise<GuardianRequestResult> {
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
  // invites for their plan, but only the invitee may ask their own guardian.
  // The host recovery path below is deliberately separate.
  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('id, event_id, invitee_id, status')
    .eq('id', input.inviteId)
    .eq('event_id', input.eventId)
    .maybeSingle<{
      id: string;
      event_id: string;
      invitee_id: string | null;
      status: string;
    }>();
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
  if (invite.status !== 'pending_approval') {
    return validation('This RSVP isn’t waiting on a guardian.');
  }

  // Keep the event read under the caller's RLS session too. No service-role
  // access occurs until the exact invite, event, and caller are tied together.
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, parental_approval')
    .eq('id', input.eventId)
    .maybeSingle();
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
    .eq('event_id', input.eventId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existingError) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.create',
      existingError,
      { eventId: input.eventId },
      'Could not check the approval request. Try again.',
    );
  }

  const token = randomBytes(24).toString('hex');
  const { data: approval, error } = existing
    ? await admin
        .from('parental_approvals')
        .update({ guardian_email: guardianEmail, guardian_name: guardianName, token })
        .eq('id', existing.id)
        .eq('invite_id', input.inviteId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle<{ id: string }>()
    : await admin
        .from('parental_approvals')
        .insert({
          invite_id: input.inviteId,
          event_id: input.eventId,
          guardian_email: guardianEmail,
          guardian_name: guardianName,
          token,
        })
        .select('id')
        .maybeSingle<{ id: string }>();

  if (error || !approval) {
    return reportAndFail(
      'SB-RSVP-SAVE',
      'parental-approval.create',
      error ?? 'Missing approval row',
      { eventId: input.eventId },
      'Could not send the approval request. Try again.',
    );
  }

  const status = await deliverGuardianApproval(admin, {
    approvalId: approval.id,
    eventId: input.eventId,
    inviteId: input.inviteId,
    guardianEmail,
    guardianName,
    token,
  });

  revalidatePath(`/events/${input.eventId}`);
  return deliveryResult(status, approval.id, 'Your RSVP is saved');
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
 * This is intentionally not folded into `requestParentalApproval`: that path
 * must be bound to the invitee's own RLS-visible row, while a host needs a
 * separately authorized way to correct a mistyped/pre-empted address and
 * resend the existing capability without minting a second approval. A host
 * can resend a request; they cannot start one on the invitee's behalf.
 */
export async function resendParentalApproval(
  input: ResendApprovalInput,
): Promise<GuardianRequestResult> {
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
        .select('id')
        .eq('event_id', input.eventId)
        .eq('invite_id', input.inviteId)
        .eq('status', 'pending')
        .maybeSingle<{ id: string }>(),
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

  // Resend exists to correct a mistyped address, so the old link must stop
  // working: whoever received the mis-addressed email holds the old token.
  // Same shape as the column default (24 random bytes, hex).
  const token = randomBytes(24).toString('hex');
  const { data: updated, error: updateError } = await admin
    .from('parental_approvals')
    .update({ guardian_email: guardianEmail, guardian_name: guardianName, token })
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

  const status = await deliverGuardianApproval(admin, {
    approvalId: approval.id,
    eventId: input.eventId,
    inviteId: input.inviteId,
    guardianEmail,
    guardianName,
    token,
  });

  revalidatePath(`/events/${input.eventId}`);
  return deliveryResult(status, approval.id, 'The guardian request is saved');
}

/**
 * Tell the reader what actually happened to the email. The request row is
 * saved either way, so every non-`sent` outcome keeps `approvalId` and names
 * what is true now: saved, not yet delivered.
 */
function deliveryResult(
  status: DeliveryStatus,
  approvalId: string,
  saved: string,
): GuardianRequestResult {
  if (status === 'sent') return { ok: true, approvalId };
  if (status === 'not_configured') {
    return {
      ...failure(
        'SB-CONFIG-EMAIL',
        `${saved}, but this server can’t send email, so the guardian hasn’t been asked yet.`,
      ),
      approvalId,
    };
  }
  return {
    ...failure('SB-GUARDIAN-EMAIL', `${saved}, but the email to the guardian didn’t go out.`),
    approvalId,
  };
}

/**
 * Send the guardian their link and record what happened to it on the request
 * (`email_status`), so every later view — the invitee's card, the host's
 * panel — can say "we couldn't email them" instead of implying it arrived.
 */
async function deliverGuardianApproval(
  admin: Admin,
  input: {
    approvalId: string;
    eventId: string;
    inviteId: string;
    guardianEmail: string;
    guardianName: string | null;
    token: string;
  },
): Promise<DeliveryStatus> {
  const status = await sendGuardianEmail(admin, input);
  const { error } = await admin
    .from('parental_approvals')
    .update({ email_status: status })
    .eq('id', input.approvalId)
    .eq('invite_id', input.inviteId);
  if (error) {
    await reportOperationalError('parental-approval.email', error, {
      eventId: input.eventId,
      step: 'record-status',
    });
  }
  return status;
}

async function sendGuardianEmail(
  admin: Admin,
  input: {
    eventId: string;
    inviteId: string;
    guardianEmail: string;
    guardianName: string | null;
    token: string;
  },
): Promise<DeliveryStatus> {
  const codeFor = (status: DeliveryStatus): ErrorCode =>
    status === 'not_configured' ? 'SB-CONFIG-EMAIL' : 'SB-GUARDIAN-EMAIL';
  try {
    const facts = await loadGuardianPlanFacts(admin, input.eventId, input.inviteId);
    if (!facts) throw new Error('Guardian approval facts are missing');
    const message = guardianApprovalEmail({
      facts,
      guardianName: input.guardianName,
      link: approvalUrl(input.token),
    });
    const result = await sendEmailWithResult({ to: input.guardianEmail, ...message });
    if (result.status !== 'sent') {
      await reportOperationalError(
        'parental-approval.email',
        new Error(`Guardian approval email ${result.status}`),
        { eventId: input.eventId, provider: result.provider, errorCode: result.errorCode },
        codeFor(result.status),
      );
    }
    return result.status;
  } catch (emailError) {
    await reportOperationalError(
      'parental-approval.email',
      emailError,
      { eventId: input.eventId },
      'SB-GUARDIAN-EMAIL',
    );
    return 'failed';
  }
}

export interface ResolveApprovalResult {
  ok: boolean;
  outcome?: string;
  eventTitle?: string;
  /** After an approval: `accepted`, or `waitlisted` when the plan had filled. */
  inviteStatus?: string;
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

  const row = isJsonObject(data) ? data : {};
  const outcome = typeof row.outcome === 'string' ? row.outcome : undefined;
  const eventTitle = typeof row.event_title === 'string' ? row.event_title : undefined;
  const inviteStatus = typeof row.invite_status === 'string' ? row.invite_status : undefined;

  if (outcome === 'event_gone' || outcome === 'invite_gone') {
    return {
      ...failure(
        'SB-RSVP-GONE',
        outcome === 'event_gone'
          ? 'This plan no longer exists, so there is nothing left to approve.'
          : 'The invitation this approval was for has been withdrawn.',
      ),
      outcome,
    };
  }

  if (outcome === 'event_closed') {
    return {
      ...failure(
        'SB-RSVP-CLOSED',
        'This plan isn’t taking answers anymore, so there is nothing left to approve.',
      ),
      outcome,
      eventTitle,
    };
  }

  if (outcome === 'not_found' || outcome === 'invite_mismatch') {
    return {
      ...failure('SB-LINK-UNKNOWN', 'This approval link is not valid.'),
      outcome,
    };
  }

  if (outcome === 'already_resolved') {
    const status = typeof row.status === 'string' ? row.status : 'resolved';
    return {
      ok: true,
      outcome: 'already_resolved',
      eventTitle,
      error: `This has already been ${status}.`,
    };
  }

  if (outcome === 'approved' || outcome === 'denied') {
    await afterGuardianAnswer(admin, token, outcome, inviteStatus, eventTitle);
  }

  return { ok: true, outcome, eventTitle, inviteStatus };
}

/**
 * Everything that follows a guardian's answer: the cascade, the host, and the
 * person whose yes it was — who is the one most waiting to hear.
 */
async function afterGuardianAnswer(
  admin: Admin,
  token: string,
  outcome: 'approved' | 'denied',
  inviteStatus: string | undefined,
  eventTitle: string | undefined,
): Promise<void> {
  const { data: approval } = await admin
    .from('parental_approvals')
    .select('event_id, invite_id')
    .eq('token', token)
    .maybeSingle();
  if (!approval) return;
  const eventId = approval.event_id as string;
  const title = eventTitle ?? 'the plan';

  await advanceEventCascade(eventId);

  const [{ data: event }, { data: invite }] = await Promise.all([
    admin.from('events').select('host_id').eq('id', eventId).maybeSingle(),
    admin
      .from('invites')
      .select('invitee_id, invitee:profiles(display_name)')
      .eq('id', approval.invite_id)
      .maybeSingle(),
  ]);
  const profile = Array.isArray(invite?.invitee) ? invite?.invitee[0] : invite?.invitee;
  const who = profile?.display_name?.trim() || 'someone';
  const inviteeId = (invite?.invitee_id as string | null) ?? null;
  const waitlisted = inviteStatus === 'waitlisted';

  if (outcome === 'approved' && inviteStatus === 'accepted' && inviteeId) {
    // Their commitment, completed by the guardian rather than by them — the
    // same shape as an Open Table approval, so the same service-role form of
    // the Give Space check, which re-verifies the accepted invite itself.
    try {
      await admin.rpc('note_give_space_overlap_for', {
        p_user: inviteeId,
        p_event: eventId,
      });
    } catch (noteError) {
      await reportOperationalError('give-space.note', noteError, { eventId });
    }
  }

  if (event) {
    await notifyUsers([event.host_id], outcome === 'approved'
      ? {
          kind: 'parental_approval',
          title: 'Guardian approved',
          body: waitlisted
            ? `A guardian approved ${who} for ${title}, but it had filled, so they’re on the waitlist.`
            : `A guardian approved ${who} for ${title}. They’re in.`,
          url: `/events/${eventId}`,
        }
      : {
          kind: 'parental_approval_denied',
          title: 'Guardian denied',
          body: `A guardian didn’t approve ${who} for ${title}.`,
          url: `/events/${eventId}`,
        });
  }
  if (inviteeId) {
    await notifyUsers([inviteeId], outcome === 'approved'
      ? {
          kind: 'parental_approval',
          title: waitlisted ? 'Approved - on the waitlist' : 'You’re in',
          body: waitlisted
            ? `Your guardian approved ${title}, but it filled up first, so you’re on the waitlist.`
            : `Your guardian approved ${title}. Your RSVP counts now.`,
          url: `/events/${eventId}`,
        }
      : {
          kind: 'parental_approval_denied',
          title: 'Not approved',
          body: `Your guardian didn’t approve ${title}, so your RSVP was withdrawn.`,
          url: `/events/${eventId}`,
        });
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
}
