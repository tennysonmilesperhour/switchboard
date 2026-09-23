'use server';
import { imminentChange, urgentChangeDeadline } from '@/lib/sms-commands';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser, requireUserOrRedirect } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEventManager } from '@/lib/server/authz';
import {
  advanceEventCascade,
  notifyCurrentInviteWave,
  type InvitationDeliverySummary,
} from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { formatDateTime } from '@/lib/format';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { isValidMediaRef } from '@/lib/server/media';
import type { RecurrenceKind } from '@/lib/types';
import {
  nextOccurrenceAfter,
  normalizeCustomInterval,
} from '@/lib/engine/recurrence';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import type { ActionResult } from '@/lib/errors';
import { failure, validation } from '@/lib/errors';
import { guestEmailHeaders, looksLikeEmail, sendEmails } from '@/lib/server/email';
import { canAddInvitees, MAX_INVITEES_PER_EVENT } from '@/lib/invite-limits';
import { consumeEventOutboundSlot } from '@/lib/server/invite-delivery-limit';
import { safeHttpUrl } from '@/lib/security';
import { toJson } from '@/lib/supabase/json';
import { hasInviteDetails } from '@/lib/event-details';
import { capacityProblem } from '@/lib/plan-capacity';
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

export async function createEvent(input: CreateEventInput): Promise<CreateEventResult> {
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

  let delivery: InvitationDeliverySummary | undefined;
  if (!input.enablePoll) {
    try {
      delivery = await notifyCurrentInviteWave(eventId);
    } catch (cascadeError) {
      await reportOperationalError('event-initial-delivery', cascadeError, { eventId });
    }
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
 * quietly pings everyone who has already accepted so nobody shows up to the
 * old details.
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
  const { data: before } = await admin
    .from('events')
    .select('starts_at, location_name, location_address, title')
    .eq('id', eventId)
    .maybeSingle();
  if (!before) return validation('Plan not found.');

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
        title: 'Plan updated ✏️',
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
  field: 'show_invite_list' | 'show_accepted' | 'show_expired',
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
  const update =
    field === 'show_invite_list'
      ? { show_invite_list: enabled }
      : field === 'show_accepted'
        ? { show_accepted: enabled }
        : { show_expired: enabled };
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
export async function confirmEvent(eventId: string): Promise<void> {
  const { user } = await requireUserOrRedirect();
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok || !manager.isManager) return;
  const admin = createAdminClient();
  await admin.from('events').update({ status: 'confirmed' }).eq('id', eventId);
  // The guest list is locked in — retire anything still in motion so nobody is
  // left in a permanently invisible 'queued'/'sent' limbo the cascade (which
  // only runs while 'inviting') will never touch again.
  await admin
    .from('invites')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .in('status', ['queued', 'sent', 'requested']);
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
}

/** Host affirms the plan actually happened. Records happened_at, moves the
 *  event to 'past', and retires any invites still in motion. This is what
 *  powers the real-world recap and the one-tap Run It Back. */
export async function markHappened(eventId: string): Promise<void> {
  const { user } = await requireUserOrRedirect();
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok || !manager.isManager) return;
  const admin = createAdminClient();
  // Only close a plan whose start time has actually passed. The UI "elapsed"
  // gate is client-controlled — a fast browser clock or a direct call to this
  // action could otherwise flip a future or undated plan to 'past' and cancel
  // its in-flight invites — so require starts_at present and <= now in the DB,
  // where it can't be spoofed. maybeSingle() returns null when the row doesn't
  // meet the filter, letting us bail before touching invites or analytics.
  const now = new Date().toISOString();
  const { data: happened } = await admin
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
  if (!happened) return;
  await admin
    .from('invites')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .in('status', ['queued', 'sent', 'requested']);

  const { count } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  await capture(user.id, ANALYTICS_EVENTS.planHappened, {
    event_id: eventId,
    attendee_count: count ?? 0,
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
}

export async function cancelEvent(
  eventId: string,
  reason?: string,
  voiceUrl?: string,
): Promise<void> {
  const { user } = await requireUserOrRedirect();
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok || !manager.isManager) return;
  const admin = createAdminClient();

  const cleanReason = reason?.trim().slice(0, 2000) || null;
  const trimmedVoice = voiceUrl?.trim();
  const cleanVoiceUrl =
    trimmedVoice && isValidMediaRef(trimmedVoice) ? trimmedVoice : null;

  const { data: event } = await admin
    .from('events')
    .select('title, host_id')
    .eq('id', eventId)
    .maybeSingle();
  await admin
    .from('events')
    .update({
      status: 'cancelled',
      cancel_reason: cleanReason,
      cancel_voice_url: cleanVoiceUrl,
    })
    .eq('id', eventId);

  const title = event?.title ?? 'the plan';
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
          event?.host_id ?? user.id,
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
  await admin
    .from('invites')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .in('status', ['queued', 'sent', 'waitlisted', 'requested']);

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
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
 * Clone a plan into a fresh one - same crew, same place, carrying the invite
 * mode, visibility, presentation, and recurrence forward. Anyone who said "not
 * my thing" is quietly left off; everyone else keeps their place in the order.
 * `startsAt` lets the caller either leave the new date TBD (Run It Back) or
 * pre-fill the next occurrence (a recurring plan's "Schedule the next one").
 * Returns the new event id, or null if the source can't be cloned by this user.
 */
async function cloneEventForReuse(
  userId: string,
  sourceId: string,
  startsAt: string | null,
): Promise<string | null> {
  const supabase = await createClient();
  const manager = await checkEventManager(userId, sourceId);
  if (!manager.ok || !manager.isManager) return null;

  const { data: source } = await supabase
    .from('events')
    .select('*')
    .eq('id', sourceId)
    .single();
  if (!source || source.host_id !== userId) return null;

  // Writes go through the service-role client for the same reason as
  // createEvent: the host can't read back a room they don't yet belong to
  // under RLS. Ownership is pinned to the authenticated user on every row.
  const admin = createAdminClient();

  const { data: room } = await admin
    .from('rooms')
    .insert({ kind: 'event', title: source.title, created_by: userId })
    .select('id')
    .single();
  if (room) {
    await admin.from('room_members').insert({ room_id: room.id, member_id: userId });
  }

  const { data: clone } = await admin
    .from('events')
    .insert({
      host_id: userId,
      title: source.title,
      description: source.description,
      location_name: source.location_name,
      location_address: source.location_address,
      starts_at: startsAt,
      // Same host, same crew — carry the zone so the reused plan renders in the
      // host's local time even before a new date is picked.
      time_zone: source.time_zone,
      capacity: source.capacity,
      invite_mode: source.invite_mode,
      open_table: source.open_table,
      status: 'inviting',
      show_invite_list: source.show_invite_list,
      show_accepted: source.show_accepted,
      show_expired: source.show_expired,
      cover_url: source.cover_url,
      theme: source.theme,
      wishlist_url: source.wishlist_url,
      // Keep it a standing plan: the clone repeats on the same cadence.
      recurrence: source.recurrence,
      recurrence_interval_days: source.recurrence_interval_days,
      room_id: room?.id ?? null,
    })
    .select('id')
    .single();
  if (!clone) return null;

  const { data: priorInvites } = await supabase
    .from('invites')
    .select('invitee_id, guest_name, guest_contact, position, group_stage, window_minutes, decline_note')
    .eq('event_id', sourceId)
    .order('position');

  const carryOver = (priorInvites ?? []).filter(
    (i) => i.decline_note !== 'not_my_thing',
  );
  if (carryOver.length > 0) {
    await admin.from('invites').insert(
      carryOver.map((i, index) => ({
        event_id: clone.id,
        invitee_id: i.invitee_id,
        guest_name: i.guest_name,
        guest_contact: i.guest_contact,
        position: index,
        group_stage: i.group_stage,
        window_minutes: i.window_minutes,
      })),
    );
  }

  const { data: questions } = await supabase
    .from('event_questions')
    .select('prompt, required, position, kind, options')
    .eq('event_id', sourceId);
  if (questions && questions.length > 0) {
    await admin.from('event_questions').insert(
      questions.map((q) => ({ ...q, event_id: clone.id })),
    );
  }

  try {
    await advanceEventCascade(clone.id);
  } catch (cascadeError) {
    console.error('Failed to start cascade for reused plan', cascadeError);
  }

  return clone.id as string;
}

/**
 * Run It Back: clone a past plan into a fresh one - same people, same place,
 * new date TBD. Anyone who said "not my thing" is quietly left off; everyone
 * else keeps their place in the order. The host lands on the new draft.
 */
export async function runItBack(eventId: string): Promise<never> {
  const { user } = await requireUserOrRedirect();

  // new date TBD - the group can settle it in the room
  const cloneId = await cloneEventForReuse(user.id, eventId, null);
  redirect(cloneId ? `/events/${cloneId}` : `/events/${eventId}`);
}

/**
 * Schedule the next occurrence of a recurring plan: clone the crew forward onto
 * the upcoming date its cadence produces. Host only. If the source doesn't
 * repeat or has no start time to count from, the new date is left TBD.
 */
export async function scheduleNextOccurrence(eventId: string): Promise<never> {
  const { supabase, user } = await requireUserOrRedirect();
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok || !manager.isManager) redirect('/plans');

  const { data: source } = await supabase
    .from('events')
    .select('host_id, starts_at, recurrence, recurrence_interval_days')
    .eq('id', eventId)
    .single();
  if (!source || source.host_id !== user.id) redirect('/plans');

  let startsAt: string | null = null;
  if (source.starts_at && source.recurrence && source.recurrence !== 'none') {
    const next = nextOccurrenceAfter(
      new Date(source.starts_at),
      source.recurrence as RecurrenceKind,
      normalizeCustomInterval(source.recurrence_interval_days),
      new Date(),
    );
    startsAt = next ? next.toISOString() : null;
  }

  const cloneId = await cloneEventForReuse(user.id, eventId, startsAt);
  redirect(cloneId ? `/events/${cloneId}` : `/events/${eventId}`);
}

/** Host closes voting and moves an AWI event into the inviting phase. */
export async function startInviting(eventId: string): Promise<void> {
  const { user } = await requireUserOrRedirect();
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok || !manager.isManager) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .update({ status: 'inviting' })
    .eq('id', eventId);
  if (!error) {
    // People can now say "I'm in" through the share link while the date is
    // still being decided (rsvp_via_share_token accepts `deciding`). The
    // cascade below only speaks to invites it is sending, so it would never
    // reach them — and a yes given to a dateless plan has to be answered with
    // the date when it lands, or the promise the link made goes unkept.
    await notifyDateSettled(admin, eventId);
    await advanceEventCascade(eventId);
  }
  revalidatePath(`/events/${eventId}`);
}

/** Tell everyone who already accepted that the plan now has a date. */
async function notifyDateSettled(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<void> {
  const { data: event } = await admin
    .from('events')
    .select('id, title, starts_at, time_zone')
    .eq('id', eventId)
    .maybeSingle<{
      id: string;
      title: string;
      starts_at: string | null;
      time_zone: string | null;
    }>();
  if (!event) return;

  const { data: accepted } = await admin
    .from('invites')
    .select('invitee_id')
    .eq('event_id', eventId)
    .eq('status', 'accepted')
    .not('invitee_id', 'is', null);

  const recipients = (accepted ?? [])
    .map((row) => row.invitee_id as string | null)
    .filter((id): id is string => Boolean(id));
  if (recipients.length === 0) return;

  // In the plan's own zone — a notification has no viewer zone, so without this
  // it would announce the server's UTC.
  const when = event.starts_at ? formatDateTime(event.starts_at, event.time_zone) : null;
  await notifyUsers(recipients, {
    kind: 'event_date_set',
    title: 'The date is set 📅',
    body: when
      ? `${event.title} is happening ${when}.`
      : `${event.title} is moving ahead - the host has closed the vote.`,
    url: `/events/${event.id}`,
  });
}
