'use server';
import { imminentChange, urgentChangeDeadline } from '@/lib/sms-commands';

import { revalidatePath } from 'next/cache';
import { requireUser, requireUserOrRedirect } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEventManager, type ManagerCheck } from '@/lib/server/authz';
import {
  advanceEventCascade,
  notifyCurrentInviteWave,
  type InvitationDeliverySummary,
} from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { notifyDateSettled, openDecidingPlan } from '@/lib/server/poll-notices';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { isValidMediaRef } from '@/lib/server/media';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import type { ActionResult } from '@/lib/errors';
import { failure, validation } from '@/lib/errors';
import { guestEmailHeaders, looksLikeEmail, sendEmails } from '@/lib/server/email';
import { canAddInvitees, MAX_INVITEES_PER_EVENT } from '@/lib/invite-limits';
import { consumeEventOutboundSlot } from '@/lib/server/invite-delivery-limit';
import { safeHttpUrl } from '@/lib/security';
import { toJson } from '@/lib/supabase/json';
import { hasInviteDetails } from '@/lib/event-details';
import { invitationStep, readyToSendInvitations } from '@/lib/poll-readiness';
import { capacityProblem } from '@/lib/plan-capacity';
import { normalizeNewQuestions, planExtrasProblem } from '@/lib/plan-extras';
import { sameInstant } from '@/lib/plan-time';
import {
  createEventError,
  deliveryWarning,
  persistEventCoordinates,
  resolveInvitees,
  isContactMatchRateLimit,
  CONTACT_MATCH_LIMIT_MESSAGE,
  type CreateEventInput,
  type CreateEventResult,
  type UpdateEventInput,
} from '@/lib/actions/event-action-shared';

export async function createEvent(
  // The ideas floated in the wizard for the first poll; optional, and only read
  // when the plan starts as a vote.
  input: CreateEventInput & { pollOptions?: string[] },
): Promise<CreateEventResult> {
  const { supabase, user } = await requireUserOrRedirect();

  const title = input.title.trim();
  if (!title) return createEventError('Please give your plan a name before sending it.');
  if (!hasInviteDetails(input.locationName, input.description)) {
    return createEventError(
      'Add a location or a short detail so invitees know what they’re answering.',
    );
  }
  if (input.invitees.length === 0) {
    return createEventError('Add at least one person to invite before sending.');
  }
  if (!canAddInvitees(0, input.invitees.length)) {
    return createEventError(
      `A plan can include up to ${MAX_INVITEES_PER_EVENT} people.`,
    );
  }
  // A plan can be undated (Time TBD), but if a start time is given it must be in
  // the future — the client blocks this too, but never trust the client.
  if (input.startsAt && new Date(input.startsAt).getTime() < Date.now()) {
    return createEventError('That date has already passed. Pick a time in the future.');
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    return createEventError('End time should be after the start time.');
  }
  // Refused here with a sentence rather than left to `capacity > 0` and the
  // `::int` cast in `create_event_atomic`, which reported a typo as a failed
  // publish with an operator code.
  const capacityError = capacityProblem(input.capacity);
  if (capacityError) return createEventError(capacityError);
  if (input.enablePoll) {
    const now = Date.now();
    if (input.suggestDeadline && new Date(input.suggestDeadline).getTime() < now) {
      return createEventError('Suggestion deadline should be in the future.');
    }
    if (input.voteDeadline && new Date(input.voteDeadline).getTime() < now) {
      return createEventError('Voting deadline should be in the future.');
    }
    if (
      input.suggestDeadline &&
      input.voteDeadline &&
      new Date(input.suggestDeadline) > new Date(input.voteDeadline)
    ) {
      return createEventError('Suggestion deadline should be before voting closes.');
    }
  }

  let invitees: typeof input.invitees;
  try {
    invitees = await resolveInvitees(supabase, input.invitees);
  } catch (error) {
    if (!isContactMatchRateLimit(error)) throw error;
    return failure('SB-RATE-LIMIT', CONTACT_MATCH_LIMIT_MESSAGE);
  }

  // Both land in an `href`/`src` on pages guests open, including the public
  // invitation links — so they get the same scheme check `updateEvent` applies,
  // rather than only being cleaned up on a later edit.
  const wishlistUrl = safeHttpUrl(input.wishlistUrl);
  const coverUrl = safeHttpUrl(input.coverUrl);

  const { data: eventId, error } = await supabase.rpc('create_event_atomic', {
    p_input: toJson({
      ...input,
      title,
      wishlistUrl,
      coverUrl,
      invitees,
      parentalApproval: input.parentalApproval ?? false,
    }),
  });
  if (error || typeof eventId !== 'string') {
    return reportAndFail(
      'SB-PLAN-CREATE',
      'event-create',
      error ?? 'Missing event id',
      { userId: user.id },
      'Something went wrong publishing your plan. Nothing was saved.',
    );
  }

  // A plan that starts as a vote tells its people there is a vote, and gives
  // email guests the link to help pick the date, once, here (decision D4). One
  // that doesn't sends its first wave of invitations.
  let delivery: InvitationDeliverySummary | undefined;
  try {
    delivery = input.enablePoll
      ? await openDecidingPlan(supabase, eventId, user.id, input.pollOptions)
      : await notifyCurrentInviteWave(eventId);
  } catch (cascadeError) {
    await reportOperationalError('event-initial-delivery', cascadeError, { eventId });
  }

  // A plan made from a ritual schedules the next one, whichever of the pair
  // made it (D8). Best-effort: the plan exists either way.
  if (input.ritualId) {
    const { error: ritualError } = await supabase.rpc('note_ritual_planned', { p_ritual: input.ritualId, p_event: eventId });
    if (ritualError) await reportOperationalError('ritual.plan', ritualError, { eventId });
  }

  // Put the plan on the map. After invite delivery so a geocode can't delay it.
  await persistEventCoordinates(supabase, eventId, input);

  await capture(user.id, ANALYTICS_EVENTS.planCreated, {
    invite_mode: input.inviteMode,
    has_poll: !!input.enablePoll,
  });

  return {
    ok: true,
    eventId,
    delivery,
    warning: deliveryWarning(delivery),
  };
}

/**
 * Host/co-host edit of an already-published plan. Changing the time or place
 * pings everyone who has already accepted so nobody shows up to the old
 * details. With `extras` it also changes what D18 lets change after creation:
 * the cover, theme, reminders, Open Table, and new questions.
 */
export async function updateEventDetails(
  eventId: string,
  input: UpdateEventInput,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can edit this plan.');
  }

  const title = input.title.trim();
  if (!title) return validation('Give your plan a name.');
  // The same floor `createEvent` sets, applied to the edit that can undo it.
  // Invitations are already out by the time anyone edits, so a plan saved back
  // to a bare title leaves every link the host has sent — /i/<token>,
  // /rsvp/<token>, the event page — showing a name and nothing a recipient
  // could answer from. Refusing on create and permitting on edit is the same
  // rule holding on one surface and not the other.
  if (!hasInviteDetails(input.locationName, input.description)) {
    return validation(
      'Add a location or a short detail so invitees know what they’re answering.',
    );
  }
  const capacityError = capacityProblem(input.capacity);
  if (capacityError) return validation(capacityError);
  // `createEvent` has always refused an end at or before the start; the edit
  // form did not, so a plan could be saved as "9:00 PM – 7:00 PM" and every
  // invitation, calendar entry and reminder would carry it.
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    return validation('End time should be after the start time.');
  }

  const wishlistUrl = safeHttpUrl(input.wishlistUrl);

  const admin = createAdminClient();
  const [{ data: before }, { data: asked, error: askedError }] = await Promise.all([
    admin
      .from('events')
      .select('starts_at, location_name, location_address, title')
      .eq('id', eventId)
      .maybeSingle(),
    admin.from('event_questions').select('position').eq('event_id', eventId),
  ]);
  if (!before) return validation('Plan not found.');
  if (askedError) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', askedError, { eventId, step: 'questions-read' });
  }

  // D18: cover, theme, reminders, Open Table, and questions added (never
  // edited) may change after creation. Checked before anything is written.
  const extras = input.extras;
  const newQuestions = extras ? normalizeNewQuestions(extras.newQuestions) : [];
  const extrasError = extras
    ? planExtrasProblem({
        openTable: extras.openTable,
        capacity: input.capacity,
        theme: extras.theme,
        existingQuestions: (asked ?? []).length,
        newQuestions: newQuestions.length,
      })
    : null;
  if (extrasError) return validation(extrasError);

  // Compared as instants, never as strings. The row comes back from PostgREST
  // as `2026-09-25T02:00:00+00:00` and the form sends `toISOString()`'s
  // `2026-09-25T02:00:00.000Z` - the same moment in two spellings - so the
  // string test was true on every save of a dated plan. Fixing a typo in the
  // details told every accepted guest "the time changed", and inside the last
  // two hours it went out as an urgent change.
  const whenChanged = !sameInstant(before.starts_at, input.startsAt);
  // A plan that is under way can still have its details fixed, so a start in
  // the past is only refused when this edit is what put it there.
  if (whenChanged && input.startsAt && new Date(input.startsAt).getTime() < Date.now()) {
    return validation('That time has already passed. Pick a time in the future.');
  }

  const { error } = await admin
    .from('events')
    .update({
      title,
      description: input.description?.trim() || null,
      location_name: input.locationName?.trim() || null,
      location_address: input.locationAddress?.trim() || null,
      starts_at: input.startsAt || null,
      ends_at: input.endsAt || null,
      // The form recomputes `startsAt` from the editor's browser zone, so
      // re-anchor `time_zone` to that same zone to keep the pair consistent.
      // Only when the client actually resolved a zone — never overwrite a good
      // stored zone with null just because this browser couldn't report one.
      ...(input.timeZone ? { time_zone: input.timeZone.slice(0, 64) } : {}),
      capacity: input.capacity,
      wishlist_url: wishlistUrl,
      ...(extras
        ? {
            // Shown on pages guests open, so held to the same scheme check.
            cover_url: safeHttpUrl(extras.coverUrl),
            theme: extras.theme,
            reminders_enabled: extras.remindersEnabled,
            open_table: extras.openTable,
          }
        : {}),
      // The reminder markers describe the time they were sent for. Left set, a
      // plan moved after its day-before note went out never got one for the
      // new date, and one moved later after "starting soon" never got that.
      ...(whenChanged ? { reminded_day_before_at: null, reminded_soon_at: null } : {}),
    })
    .eq('id', eventId);
  if (error) {
    return reportAndFail(
      'SB-PLAN-SAVE',
      'event-update',
      error,
      { eventId },
      'Could not save your changes. Try again.',
    );
  }

  // New questions go in after the ones already asked, through the caller's own
  // session so `event_questions_write` (host or co-host) decides. Anyone who
  // already said yes is not asked again; the answers start with the next yes.
  if (newQuestions.length > 0) {
    const next = Math.max(-1, ...(asked ?? []).map((row) => row.position)) + 1;
    const { error: questionError } = await auth.supabase
      .from('event_questions')
      .insert(newQuestions.map((q, i) => ({ ...q, event_id: eventId, position: next + i })));
    if (questionError) {
      return reportAndFail(
        'SB-PLAN-SAVE',
        'event-update',
        questionError,
        { eventId, step: 'questions' },
        'Your other changes saved, but the new questions didn’t. Try adding them again.',
      );
    }
  }

  // Notify accepted guests only when the logistics they'd act on actually change.
  const whereChanged = (before.location_name ?? null) !== (input.locationName?.trim() || null) || (before.location_address ?? null) !== (input.locationAddress?.trim() || null);
  if (whenChanged || whereChanged) {
    const { data: accepted } = await admin
      .from('invites')
      .select('invitee_id')
      .eq('event_id', eventId)
      .eq('status', 'accepted')
      .not('invitee_id', 'is', null);
    const recipients = (accepted ?? [])
      .map((row) => row.invitee_id as string | null)
      .filter((id): id is string => Boolean(id) && id !== user.id);
    if (recipients.length > 0) {
      const changed = whenChanged && whereChanged ? 'time and place' : whenChanged ? 'time' : 'place';
      await notifyUsers(recipients, {
        kind: imminentChange(before.starts_at, input.startsAt || null) ? 'event_urgent_change' : 'event_updated',
        urgentUntil: urgentChangeDeadline(before.starts_at, input.startsAt || null),
        title: 'Plan updated',
        body: `The ${changed} for ${title} changed. Tap for the latest.`,
        url: `/events/${eventId}`,
      });
    }
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
  return { ok: true };
}

/**
 * Change what attendees can see about each other after the plan exists.
 *
 * These three flags were settable exactly once, on the wizard's Visibility
 * step, and then frozen forever — so a host who ticked "show who's accepted"
 * while setting up a surprise, or left the invite list hidden and later wanted
 * people to see who else was coming, had no way back. Nothing about them is
 * creation-time by nature.
 *
 * Host/co-host only, through the same `checkEventManager` gate every other
 * management action uses. None of these is authority state: they widen or
 * narrow what an already-authorized attendee sees on a page they can already
 * open, and the guest-list query itself re-checks `show_accepted` server-side.
 */
export async function setEventVisibility(
  eventId: string,
  field: 'show_invite_list' | 'show_accepted',
  enabled: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PLAN-ACCESS');
  }

  const admin = createAdminClient();
  // `show_expired` is retired (D3): nothing reads it, so nothing may set it.
  const update =
    field === 'show_invite_list' ? { show_invite_list: enabled } : { show_accepted: enabled };
  const { error } = await admin
    .from('events')
    .update(update)
    .eq('id', eventId);
  if (error) {
    return reportAndFail('SB-PLAN-SAVE', 'event-visibility', error, { eventId });
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * What a host is told when a lifecycle button meets a plan that has already
 * moved on — a second tab, a co-host, or the cron got there first. Nothing
 * changed, and reloading shows where the plan actually stands.
 */
const PLAN_MOVED_ON =
  'This plan has moved on since this page loaded, so nothing changed. Reload to see where it stands.';

/**
 * The refusal for a lifecycle button pressed by someone who is not a manager,
 * or null to go ahead. Reported as "couldn't check" or "not the host" — never
 * as silence. Takes the check's result rather than making it, so the
 * `checkEventManager(` call stays visible in every action that goes on to
 * create a service-role client.
 */
function managerRefusal(manager: ManagerCheck): ActionResult | null {
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can change this plan.');
  }
  return null;
}

/**
 * Lock the guest list in. Only from `inviting` — the one status HostControls
 * offers this button for (`hostCanEditInvitees`). The guard sits in the
 * UPDATE's own WHERE so a stale tab or a direct call cannot drag a cancelled or
 * past plan back to life and reopen its share link.
 */
export async function confirmEvent(eventId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const refusal = managerRefusal(await checkEventManager(auth.user.id, eventId));
  if (refusal) return refusal;
  const admin = createAdminClient();
  const { data: confirmed, error } = await admin
    .from('events')
    .update({ status: 'confirmed' })
    .eq('id', eventId)
    .eq('status', 'inviting')
    .select('id')
    .maybeSingle();
  if (error) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', error, {
      eventId,
      step: 'confirm',
    });
  }
  if (!confirmed) return failure('SB-PLAN-SAVE', PLAN_MOVED_ON);
  // The guest list is locked in — retire anything still in motion so nobody is
  // left in a permanently invisible 'queued'/'sent' limbo the cascade (which
  // only runs while 'inviting') will never touch again. The plan is confirmed
  // either way, so a failure here is logged rather than reported as one: a
  // retry would only meet the guard above.
  const { error: retireError } = await admin
    .from('invites')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .in('status', ['queued', 'sent', 'requested']);
  if (retireError) {
    await reportOperationalError('event-update', retireError, {
      eventId,
      step: 'confirm-retire-invites',
    });
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
  return { ok: true };
}

/** Host affirms the plan actually happened. Records happened_at, moves the
 *  event to 'past', and retires any invites still in motion. This is what
 *  powers the real-world recap and the one-tap Run It Back. */
export async function markHappened(eventId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const refusal = managerRefusal(await checkEventManager(auth.user.id, eventId));
  if (refusal) return refusal;
  const admin = createAdminClient();
  // Only close a plan whose start time has actually passed. The UI "elapsed"
  // gate is client-controlled — a fast browser clock or a direct call to this
  // action could otherwise flip a future or undated plan to 'past' and cancel
  // its in-flight invites — so require starts_at present and <= now in the DB,
  // where it can't be spoofed. maybeSingle() returns null when the row doesn't
  // meet the filter, letting us bail before touching invites or analytics.
  const now = new Date().toISOString();
  const { data: happened, error } = await admin
    .from('events')
    .update({ status: 'past', happened_at: now })
    .eq('id', eventId)
    .neq('status', 'cancelled')
    // Transition only once. Excluding rows already 'past' keeps this
    // idempotent under retries / double-submits / direct calls, so a replay
    // can't overwrite happened_at or re-fire the plan_happened North Star
    // metric (the row no longer matches, and maybeSingle() returns null).
    .neq('status', 'past')
    .not('starts_at', 'is', null)
    .lte('starts_at', now)
    .select('id')
    .maybeSingle();
  if (error) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', error, {
      eventId,
      step: 'happened',
    });
  }
  if (!happened) {
    // Nothing matched. Say which guard it was: the button is shown on the
    // device's clock, so a phone running fast offers it before the server
    // agrees the plan has started — and that host deserves a sentence, not a
    // button that does nothing.
    const { data: current } = await admin
      .from('events')
      .select('status, starts_at')
      .eq('id', eventId)
      .maybeSingle();
    // Already past: a replay of a tap that landed. The outcome they asked for
    // holds, so this is not a failure.
    if (current?.status === 'past') return { ok: true };
    if (current?.status === 'cancelled') {
      return failure('SB-PLAN-SAVE', 'This plan was called off, so it can’t be marked as happened.');
    }
    // As instants: the row reads back as `…+00:00`, `now` is `…Z`.
    if (current && (!current.starts_at || Date.parse(current.starts_at) > Date.parse(now))) {
      return failure(
        'SB-PLAN-SAVE',
        'This plan hasn’t started yet, so it can’t be marked as happened. Check the date and time on your device, or reload if the plan’s time was changed.',
      );
    }
    return failure('SB-PLAN-SAVE', PLAN_MOVED_ON);
  }
  const { error: retireError } = await admin
    .from('invites')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .in('status', ['queued', 'sent', 'requested']);
  if (retireError) {
    await reportOperationalError('event-update', retireError, {
      eventId,
      step: 'happened-retire-invites',
    });
  }

  const { count } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  await capture(auth.user.id, ANALYTICS_EVENTS.planHappened, {
    event_id: eventId,
    attendee_count: count ?? 0,
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
  return { ok: true };
}

export async function cancelEvent(
  eventId: string,
  reason?: string,
  voiceUrl?: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const refusal = managerRefusal(await checkEventManager(auth.user.id, eventId));
  if (refusal) return refusal;
  const admin = createAdminClient();

  const cleanReason = reason?.trim().slice(0, 2000) || null;
  const trimmedVoice = voiceUrl?.trim();
  const cleanVoiceUrl =
    trimmedVoice && isValidMediaRef(trimmedVoice) ? trimmedVoice : null;

  // The update reads back what the notifications need, and only matches a plan
  // that is still open — the same two statuses HostControls hides this button
  // for. A stale tab re-cancelling would otherwise re-send every cancellation
  // notice and email, and one cancelling a past plan would tell its guests a
  // plan they already went to was called off.
  const { data: event, error } = await admin
    .from('events')
    .update({
      status: 'cancelled',
      cancel_reason: cleanReason,
      cancel_voice_url: cleanVoiceUrl,
    })
    .eq('id', eventId)
    .neq('status', 'cancelled')
    .neq('status', 'past')
    .select('title, host_id')
    .maybeSingle();
  if (error) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', error, {
      eventId,
      step: 'cancel',
    });
  }
  if (!event) return failure('SB-PLAN-SAVE', PLAN_MOVED_ON);

  const title = event.title ?? 'the plan';
  // A one-line tail for notifications: the written reason, or a nudge to listen.
  const reasonTail = cleanReason
    ? ` Reason: ${cleanReason}`
    : cleanVoiceUrl
      ? ' The host left a voice note - tap to listen.'
      : '';

  // Tell everyone who had accepted — across every channel they came in on —
  // that it's off, so nobody shows up to a cancelled plan.
  const { data: accepted } = await admin
    .from('invites')
    .select('id, invitee_id, guest_contact')
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  const rows = accepted ?? [];

  const memberIds = rows
    .map((r) => r.invitee_id as string | null)
    .filter((id): id is string => Boolean(id));
  if (memberIds.length > 0) {
    await notifyUsers(memberIds, {
      kind: 'event_cancelled',
      title: 'Plan cancelled',
      body: `${title} has been called off.${reasonTail}`,
      url: `/events/${eventId}`,
    });
  }

  const guests = rows.filter((r) => !r.invitee_id && Boolean(r.guest_contact));
  const reasonLine = cleanReason ? `\n\nReason: ${cleanReason}` : '';
  const guestEmails = guests
    .filter((invite) => looksLikeEmail(invite.guest_contact))
    .map((invite) => ({
      to: invite.guest_contact as string,
      subject: `Cancelled: ${title}`,
      text: `${title} has been cancelled. Apologies for the change of plans.${reasonLine}\n\n- Switchboard`,
      headers: guestEmailHeaders(),
    }));
  const permittedGuestEmails = (
    await Promise.all(
      guestEmails.map(async (message) =>
        (await consumeEventOutboundSlot(
          event.host_id ?? auth.user.id,
          'cancellation',
        ))
          ? message
          : null),
    )
  ).filter((message): message is (typeof guestEmails)[number] => message !== null);
  if (permittedGuestEmails.length > 0) await sendEmails(permittedGuestEmails);
  // Guest SMS is queued by the event trigger using guest-initiated consent.

  // Retire any invite still in motion so the (now belt-and-suspenders) RSVP
  // guard has nothing live to act on.
  const { error: retireError } = await admin
    .from('invites')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .in('status', ['queued', 'sent', 'waitlisted', 'requested', 'pending_approval']);
  if (retireError) {
    await reportOperationalError('event-update', retireError, {
      eventId,
      step: 'cancel-retire-invites',
    });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
  return { ok: true };
}

/**
 * Permanently remove a hosted plan and its event-bound content. This is
 * intentionally primary-host-only: co-hosts may help run a plan, but cannot
 * erase its history. Active plans with accepted guests must be cancelled first
 * so nobody loses a commitment without receiving the cancellation notice.
 */
export async function deleteEventPermanently(
  eventId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { data: outcome, error } = await supabase.rpc(
    'delete_hosted_event_permanently',
    { p_event: eventId },
  );
  if (error) {
    return reportAndFail('SB-PLAN-DELETE', 'event.delete', error, {
      eventId,
      userId: user.id,
    });
  }
  if (outcome === 'not_found') return validation('That plan was not found.');
  if (outcome === 'forbidden') {
    return failure('SB-PERM-HOST', 'Only the primary host can permanently delete this plan.');
  }
  if (outcome === 'accepted_guests') {
    return validation('Cancel the plan first so everyone who accepted is notified.');
  }
  if (outcome !== 'deleted') {
    return reportAndFail(
      'SB-PLAN-DELETE',
      'event.delete',
      new Error(`unexpected delete outcome: ${String(outcome)}`),
      { eventId, userId: user.id },
    );
  }

  revalidatePath('/plans');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Host closes voting and moves an AWI event into the inviting phase.
 *
 * Only from `deciding` — the one status HostControls offers "Send the
 * invitations" for. Without the guard in the WHERE, a stale tab or a direct
 * call moved a cancelled or past plan back to `inviting`, which reopens its
 * share link and restarts its cascade. And only once the group has decided and
 * the plan has a date — the same rule that enables the button
 * (`invitationStep` in poll-readiness.ts): the page was the only thing
 * enforcing it, so a direct call could send invitations for a date still being
 * voted on, and a poll decided on a free-text idea sent "The date is set" for a
 * plan with no date at all.
 */
export async function startInviting(eventId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const refusal = managerRefusal(await checkEventManager(auth.user.id, eventId));
  if (refusal) return refusal;
  const admin = createAdminClient();
  const [{ data: polls, error: pollError }, { data: plan, error: planError }] = await Promise.all([
    admin.from('polls').select('phase').eq('event_id', eventId),
    admin.from('events').select('starts_at').eq('id', eventId).maybeSingle(),
  ]);
  if (pollError || planError) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', pollError ?? planError, {
      eventId,
      step: 'start-inviting-polls',
    });
  }
  const step = invitationStep(readyToSendInvitations(polls ?? []), plan?.starts_at);
  if (step === 'deciding') {
    return validation('The group is still deciding, so the invitations can’t go out yet.');
  }
  if (step === 'needs-date') {
    return validation('Set the plan’s date first. The invitations go out with it.');
  }
  // `starts_at` is re-checked in the WHERE, so a date cleared since the read
  // above cannot send invitations for a plan with none.
  const { data: started, error } = await admin
    .from('events')
    .update({ status: 'inviting' })
    .eq('id', eventId)
    .eq('status', 'deciding')
    .not('starts_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', error, {
      eventId,
      step: 'start-inviting',
    });
  }
  if (!started) return failure('SB-PLAN-SAVE', PLAN_MOVED_ON);
  // People can now say "I'm in" through the share link while the date is
  // still being decided (rsvp_via_share_token accepts `deciding`). The
  // cascade below only speaks to invites it is sending, so it would never
  // reach them — and a yes given to a dateless plan has to be answered with
  // the date when it lands, or the promise the link made goes unkept.
  await notifyDateSettled(eventId);
  await advanceEventCascade(eventId);
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
