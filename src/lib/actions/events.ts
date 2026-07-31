'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser, requireUserOrRedirect } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEventManager } from '@/lib/server/authz';
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
import type { EventTheme, InviteMode, RecurrenceKind } from '@/lib/types';
import {
  nextOccurrenceAfter,
  normalizeCustomInterval,
} from '@/lib/engine/recurrence';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import type { ActionResult, ErrorCode } from '@/lib/errors';
import { looksLikeEmail, sendEmails } from '@/lib/server/email';
import { looksLikePhoneNumber, sendSmsMessages } from '@/lib/server/sms';
import { normalizePhoneNumber } from '@/lib/phone';
import { suggestWindow } from '@/lib/engine/windows';
import { parseInviteEntries, type ParsedInviteEntry } from '@/lib/invite-entry';
import { isValidCoordinate } from '@/lib/geo';
import { safeHttpUrl } from '@/lib/security';
import { geocode } from '@/lib/server/geocode';
import { hasInviteDetails } from '@/lib/event-details';

export interface WizardInvitee {
  /** Profile id for members; null for guests. */
  profileId: string | null;
  guestName?: string;
  guestContact?: string;
  groupStage: number;
  windowMinutes: number;
}

export interface CreateEventInput {
  title: string;
  description: string | null;
  locationName: string | null;
  locationAddress: string | null;
  /** Coordinate for the location, when the host picked a map-recognized place.
   *  Null falls back to a best-effort server-side geocode of the free text. */
  latitude: number | null;
  longitude: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Host's IANA zone (browser-resolved), so server renders show the intended
   *  wall-clock time. See `events.time_zone`. */
  timeZone: string | null;
  capacity: number | null;
  inviteMode: InviteMode;
  openTable: boolean;
  showInviteList: boolean;
  showAccepted: boolean;
  showExpired: boolean;
  enablePoll: boolean;
  pollResolution: 'host_pick' | 'auto' | 'runoff';
  suggestDeadline: string | null;
  voteDeadline: string | null;
  /** Whether the ~3h-before reminder sweep should ping this plan's attendees. */
  remindersEnabled: boolean;
  /** Presentation */
  coverUrl?: string | null;
  theme?: EventTheme;
  wishlistUrl?: string | null;
  /** How often the plan repeats; day-count only when recurrence is 'custom'. */
  recurrence?: RecurrenceKind;
  recurrenceIntervalDays?: number | null;
  /** Host-defined RSVP questions, in order. A 'choice' question carries the
   *  selectable `options`; 'text' (the default) is free response. */
  questions?: Array<{
    prompt: string;
    required: boolean;
    kind?: 'text' | 'choice';
    options?: string[];
  }>;
  /** Standing ritual this plan fulfills, if any. */
  ritualId?: string | null;
  /** Already in host-preferred order. */
  invitees: WizardInvitee[];
}

export interface CreateEventResult {
  ok: boolean;
  eventId?: string;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  delivery?: InvitationDeliverySummary;
  warning?: string;
}

function createEventError(error: string): CreateEventResult {
  return { ok: false, error };
}

function deliveryWarning(delivery: InvitationDeliverySummary | undefined): string | undefined {
  if (!delivery) return undefined;
  const count =
    delivery.notConfigured + delivery.failed + delivery.invalidRecipient + delivery.manual;
  return count > 0
    ? `${count} invitation channel${count === 1 ? '' : 's'} needs attention.`
    : undefined;
}

const HANDLE_PATTERN = /^@?[a-z0-9_]{3,24}$/;

function maybeHandle(
  value: string | null | undefined,
  options: { requireAt?: boolean } = {},
): string | null {
  if (options.requireAt && !String(value ?? '').trim().startsWith('@')) return null;
  const normalized = String(value ?? '').trim().toLowerCase().replace(/^@/, '');
  return HANDLE_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Look up an existing account for one free-typed identifier (handle, email, or
 * phone). Delegates to the `resolve_profile_contact` RPC so an invite finds a
 * profile the same way friend search does — critically, it matches the
 * account's *sign-in* email (auth.users.email), not only the opt-in
 * `contact_email` column, which is null for anyone who never filled it in. Runs
 * as the signed-in host, so it also skips self and blocked accounts.
 */
async function resolveProfileByContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  identifier: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .rpc('resolve_profile_contact', { p_identifier: identifier })
    .maybeSingle<{ id: string; display_name: string | null; handle: string | null }>();
  if (!data?.id) return null;
  return { id: data.id, name: data.display_name ?? data.handle ?? 'Friend' };
}

async function resolveInvitees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invitees: WizardInvitee[],
): Promise<WizardInvitee[]> {
  return Promise.all(
    invitees.map(async (invitee) => {
      if (invitee.profileId) return invitee;
      const contact = invitee.guestContact?.trim() || null;
      // Resolve by whatever the host typed: a contact (handle / email / phone)
      // or an `@handle` still sitting in the name field.
      const identifier =
        contact ?? maybeHandle(invitee.guestName, { requireAt: true });
      if (!identifier) return invitee;

      const match = await resolveProfileByContact(supabase, identifier);
      if (!match) return invitee;

      const phone = normalizePhoneNumber(contact);
      return {
        ...invitee,
        profileId: match.id,
        guestContact: phone ?? contact ?? undefined,
      };
    }),
  );
}

/**
 * Give a freshly-created plan a map coordinate so it appears on /map right away.
 * Prefers the point the host picked from place search; otherwise best-effort
 * geocodes the free-text location. Runs on the host's own event through the user
 * client — the events UPDATE policy already lets a host set latitude/longitude
 * (this is exactly what the map's "Locate my plans" control does), so no
 * service-role write. Purely additive: any miss just leaves the plan un-located,
 * and "Locate my plans" can still fill it in later.
 */
async function persistEventCoordinates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  input: CreateEventInput,
): Promise<void> {
  let point: { lat: number; lng: number } | null = null;
  if (isValidCoordinate(input.latitude, input.longitude)) {
    point = { lat: input.latitude as number, lng: input.longitude as number };
  } else if (input.locationName?.trim()) {
    const query = [input.locationName, input.locationAddress]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ');
    point = await geocode(query);
  }
  if (!point) return;

  const { error } = await supabase
    .from('events')
    .update({ latitude: point.lat, longitude: point.lng })
    .eq('id', eventId);
  if (error) await reportOperationalError('event-locate', error, { eventId });
}

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
  // A plan can be undated (Time TBD), but if a start time is given it must be in
  // the future — the client blocks this too, but never trust the client.
  if (input.startsAt && new Date(input.startsAt).getTime() < Date.now()) {
    return createEventError('That date has already passed. Pick a time in the future.');
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    return createEventError('End time should be after the start time.');
  }
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

  const invitees = await resolveInvitees(supabase, input.invitees);

  // Both land in an `href`/`src` on pages guests open, including the public
  // invitation links — so they get the same scheme check `updateEvent` applies,
  // rather than only being cleaned up on a later edit.
  const wishlistUrl = safeHttpUrl(input.wishlistUrl);
  const coverUrl = safeHttpUrl(input.coverUrl);

  const { data: eventId, error } = await supabase.rpc('create_event_atomic', {
    p_input: { ...input, title, wishlistUrl, coverUrl, invitees },
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

export interface AddPeopleResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  /** How many new invitees were appended to the cascade. */
  added?: number;
  /** Entries that couldn't be added, each with a short reason. */
  skipped?: Array<{ entry: string; reason: string }>;
  warning?: string;
}

/** One resolved thing to insert: either a member (profileId) or a guest. */
type ResolvedAddition =
  | { kind: 'member'; profileId: string; label: string; contact?: string }
  | { kind: 'guest'; name: string; contact: string | null; label: string };

/**
 * Resolve one parsed entry against real profiles. A handle / email / phone that
 * matches a profile becomes a member invite; anything else becomes a guest
 * invite (with a shareable link, and an email if we have one).
 */
async function resolveAddition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedInviteEntry,
): Promise<ResolvedAddition | null> {
  if (parsed.kind === 'handle') {
    const match = await resolveProfileByContact(supabase, parsed.value);
    if (!match) return null; // unknown handle — reported as skipped
    return { kind: 'member', profileId: match.id, label: parsed.display };
  }
  if (parsed.kind === 'email') {
    const match = await resolveProfileByContact(supabase, parsed.value);
    if (match) {
      return {
        kind: 'member',
        profileId: match.id,
        label: parsed.display,
        contact: parsed.value,
      };
    }
    return { kind: 'guest', name: parsed.value, contact: parsed.value, label: parsed.display };
  }
  if (parsed.kind === 'phone') {
    const match = await resolveProfileByContact(supabase, parsed.value);
    if (match) {
      return {
        kind: 'member',
        profileId: match.id,
        label: parsed.display,
        contact: parsed.value,
      };
    }
    return { kind: 'guest', name: parsed.display, contact: parsed.value, label: parsed.display };
  }
  // Plain name — an off-platform guest reachable via their guest link.
  return { kind: 'guest', name: parsed.value, contact: null, label: parsed.display };
}

/**
 * Resolve a username to a real account for the invite flow. Returns null when
 * no profile has that handle, so the UI can say the user doesn't exist rather
 * than silently creating an off-platform guest for a typo'd username.
 */
export async function lookupInviteeByHandle(
  handle: string,
): Promise<{ id: string; name: string; handle: string } | null> {
  const cleaned = handle.trim().toLowerCase().replace(/^@/, '');
  if (!HANDLE_PATTERN.test(cleaned)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, handle')
    .eq('handle', cleaned)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: (data.display_name as string) ?? cleaned,
    handle: (data.handle as string) ?? cleaned,
  };
}

/**
 * Append people to an already-live cascade. Accepts free-typed entries
 * (handle / email / phone / name) and explicitly-picked connection ids. New
 * invitees join the back of the line as `queued` and go out when it's their
 * turn (individual mode) or as a fresh trailing wave (group / all-at-once).
 * Host/co-host only, while invitations are in motion. Best-effort delivery
 * (push to members, email to guests) runs on the cascade tick.
 */
export async function addPeopleToEvent(
  eventId: string,
  input: { entries?: string[]; profileIds?: string[] } = {},
): Promise<AddPeopleResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!(await isEventManager(user.id, eventId))) {
    return { ok: false, error: 'Only the host can add people.' };
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, status, invite_mode, starts_at')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Plan not found.' };

  // Match the response window to how soon the event is, like the wizard does,
  // instead of letting these rows fall back to the 24h table default (which
  // can outlive an imminent event and stall an individual-mode line).
  const windowMinutes = event.starts_at
    ? suggestWindow(new Date(event.starts_at), new Date()).windowMinutes
    : 1440;
  if (event.status !== 'inviting') {
    return {
      ok: false,
      error: 'You can only add people while invitations are in motion.',
    };
  }

  const skipped: Array<{ entry: string; reason: string }> = [];

  // Resolve free-typed entries into members/guests.
  const parsedEntries = parseInviteEntries(input.entries ?? []);
  const resolutions = await Promise.all(
    parsedEntries.map(async (parsed) => ({
      parsed,
      resolved: await resolveAddition(supabase, parsed),
    })),
  );
  const additions: ResolvedAddition[] = [];
  for (const { parsed, resolved } of resolutions) {
    if (!resolved) {
      skipped.push({ entry: parsed.display, reason: 'no one with that handle' });
      continue;
    }
    additions.push(resolved);
  }

  // Explicitly-picked connections (by profile id) — validate they exist.
  const pickedIds = Array.from(new Set(input.profileIds ?? [])).filter(Boolean);
  if (pickedIds.length > 0) {
    const { data: picked } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', pickedIds);
    for (const profile of picked ?? []) {
      additions.push({
        kind: 'member',
        profileId: profile.id as string,
        label: (profile.display_name as string) ?? 'Friend',
      });
    }
  }

  if (additions.length === 0) {
    return { ok: false, error: 'Add at least one person.', skipped };
  }

  // Existing invites: compute append positions/stage and skip anyone already on.
  const { data: existing } = await admin
    .from('invites')
    .select('invitee_id, guest_contact, position, group_stage')
    .eq('event_id', eventId);
  const rows = existing ?? [];
  const alreadyMembers = new Set(
    rows.map((r) => r.invitee_id).filter((id): id is string => Boolean(id)),
  );
  const alreadyContacts = new Set(
    rows
      .map((r) => r.guest_contact)
      .filter((c): c is string => Boolean(c))
      .map((c) => c.toLowerCase()),
  );
  let nextPosition = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
  const nextStage = rows.reduce((max, r) => Math.max(max, r.group_stage), -1) + 1;
  // Staged group mode sends the additions as one fresh trailing wave. Individual
  // mode ignores stage and orders purely by position. "Everyone at once" has no
  // staging: additions must join the live wave (stage 0) so the cascade sends
  // them right away — parking them in a trailing stage would leave them queued
  // (and thus invisible: no invite, no in-app notification) until every original
  // invitee happened to respond, which in an all-at-once plan may never happen.
  const groupStage =
    event.invite_mode === 'group'
      ? nextStage
      : 0;

  const toInsert: Array<Record<string, unknown>> = [];
  for (const addition of additions) {
    if (addition.kind === 'member') {
      if (addition.profileId === user.id) {
        skipped.push({ entry: addition.label, reason: 'that’s you' });
        continue;
      }
      if (alreadyMembers.has(addition.profileId)) {
        skipped.push({ entry: addition.label, reason: 'already invited' });
        continue;
      }
      alreadyMembers.add(addition.profileId);
      toInsert.push({
        event_id: eventId,
        invitee_id: addition.profileId,
        guest_contact: addition.contact ?? null,
        position: nextPosition++,
        group_stage: groupStage,
        window_minutes: windowMinutes,
        status: 'queued',
      });
    } else {
      const contactKey = addition.contact?.toLowerCase() ?? null;
      if (contactKey && alreadyContacts.has(contactKey)) {
        skipped.push({ entry: addition.label, reason: 'already invited' });
        continue;
      }
      if (contactKey) alreadyContacts.add(contactKey);
      toInsert.push({
        event_id: eventId,
        invitee_id: null,
        guest_name: addition.name,
        guest_contact: addition.contact,
        position: nextPosition++,
        group_stage: groupStage,
        window_minutes: windowMinutes,
        status: 'queued',
      });
    }
  }

  if (toInsert.length === 0) {
    return { ok: false, error: 'No new people to add.', skipped };
  }

  const { error } = await admin.from('invites').insert(toInsert);
  if (error) {
    return {
      ...(await reportAndFail(
        'SB-INVITE-SEND',
        'add-people',
        error,
        { eventId },
        'Could not add people. Try again.',
      )),
      skipped,
    };
  }

  // Send immediately if the cascade is ready for them (e.g. individual mode
  // with no live invite, or a resolved prior wave). The cron sweep is the backstop.
  let delivery: InvitationDeliverySummary | undefined;
  try {
    delivery = await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('add-people-cascade', cascadeError, { eventId });
  }

  revalidatePath(`/events/${eventId}`);
  return {
    ok: true,
    added: toInsert.length,
    skipped,
    warning: deliveryWarning(delivery),
  };
}

/**
 * Withdraw a not-yet-accepted invite (queued, live, expired, declined, …).
 * Accepted attendees can't be silently dropped this way. Advances the cascade
 * so the next person goes out if a live slot just opened. Host/co-host only.
 */
export async function removeInvite(
  eventId: string,
  inviteId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  if (!(await isEventManager(user.id, eventId))) {
    return { ok: false, error: 'Only the host can manage invites.' };
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('id, status, event_id')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite || invite.event_id !== eventId) {
    return { ok: false, error: 'Invite not found.' };
  }
  if (invite.status === 'accepted') {
    return { ok: false, error: 'They already accepted - cancel the plan or lower capacity instead.' };
  }

  const { error } = await admin.from('invites').delete().eq('id', inviteId);
  if (error) return { ok: false, error: 'Could not remove that invite. Try again.' };

  try {
    await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('remove-invite-cascade', cascadeError, { eventId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Give a lapsed invite another chance: re-queue someone who expired, declined,
 * or was cancelled so the cascade can send to them again. Host/co-host only.
 */
export async function resendInvite(
  eventId: string,
  inviteId: string,
): Promise<ActionResult & { warning?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  if (!(await isEventManager(user.id, eventId))) {
    return { ok: false, error: 'Only the host can manage invites.' };
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('id, status, event_id')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite || invite.event_id !== eventId) {
    return { ok: false, error: 'Invite not found.' };
  }
  const reopenable = ['expired', 'declined', 'cancelled'];
  if (!reopenable.includes(invite.status as string)) {
    return { ok: false, error: 'That invite is still active.' };
  }

  // Don't re-queue into a full event — the cascade would immediately cancel it
  // again, leaving the host no feedback that the resend was futile.
  const { data: capacityRow } = await admin
    .from('events')
    .select('capacity, invite_mode')
    .eq('id', eventId)
    .maybeSingle();
  const { count: acceptedCount } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  const cap =
    capacityRow?.capacity ??
    (capacityRow?.invite_mode === 'individual' ? 1 : null);
  if (cap !== null && (acceptedCount ?? 0) >= cap) {
    return { ok: false, error: 'This plan is already full.' };
  }

  const { error } = await admin
    .from('invites')
    .update({
      status: 'queued',
      sent_at: null,
      responded_at: null,
      decline_note: null,
    })
    .eq('id', inviteId);
  if (error) return { ok: false, error: 'Could not resend that invite. Try again.' };

  let delivery: InvitationDeliverySummary | undefined;
  try {
    delivery = await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('resend-invite-cascade', cascadeError, { eventId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true, warning: deliveryWarning(delivery) };
}

export interface UpdateEventInput {
  title: string;
  description: string | null;
  locationName: string | null;
  locationAddress: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Editor's IANA zone (browser-resolved); re-anchors `time_zone` whenever the
   *  start time is edited, mirroring how the form recomputes `startsAt`. */
  timeZone: string | null;
  capacity: number | null;
  wishlistUrl: string | null;
}

/**
 * Host/co-host edit of an already-published plan. Changing the time or place
 * quietly pings everyone who has already accepted so nobody shows up to the
 * old details.
 */
/** Reorder a queued invite up or down the line (host/co-host, individual mode). */
export async function moveQueuedInvite(
  eventId: string,
  inviteId: string,
  up: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!(await isEventManager(user.id, eventId))) {
    return { ok: false, error: 'Only the host can manage invites.' };
  }
  // Authorization + queued-only + the atomic position swap all live in the
  // security-definer function.
  const { error } = await supabase.rpc('move_queued_invite', {
    p_invite: inviteId,
    p_up: up,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Change the response window on a not-yet-sent invite (host/co-host). */
export async function setInviteWindow(
  eventId: string,
  inviteId: string,
  minutes: number,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!(await isEventManager(user.id, eventId))) {
    return { ok: false, error: 'Only the host can manage invites.' };
  }
  const { error } = await supabase.rpc('set_invite_window', {
    p_invite: inviteId,
    p_minutes: minutes,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function updateEventDetails(
  eventId: string,
  input: UpdateEventInput,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  if (!(await isEventManager(user.id, eventId))) {
    return { ok: false, error: 'Only the host can edit this plan.' };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give your plan a name.' };
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
    return { ok: false, error: 'Capacity must be a whole number of at least 1.' };
  }

  const wishlistUrl = safeHttpUrl(input.wishlistUrl);

  const admin = createAdminClient();
  const { data: before } = await admin
    .from('events')
    .select('starts_at, location_name, title')
    .eq('id', eventId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Plan not found.' };

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
  const whenChanged = (before.starts_at ?? null) !== (input.startsAt || null);
  const whereChanged = (before.location_name ?? null) !== (input.locationName?.trim() || null);
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
        kind: 'event_updated',
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
 * Turn the shareable invite link on or off. Enabling marks the plan an "open
 * table" so anyone the host sends the link to can ask to join (the host still
 * approves each request, via the existing join-requests panel); disabling stops
 * new link requests. Host/co-host only — the same authorization gate every other
 * management action uses. Writes through the service-role client after that
 * check, mirroring updateEventDetails/confirmEvent; `open_table` is a plain,
 * non-sensitive flag (no role/rank/ownership state), so there is no new
 * self-writable trust surface here.
 */
export async function setEventInviteLink(
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
  const { data: event } = await admin
    .from('events')
    .select('status')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Plan not found.' };
  if (event.status === 'cancelled' || event.status === 'past') {
    return { ok: false, error: 'This plan is closed.' };
  }

  const { error } = await admin
    .from('events')
    .update({ open_table: enabled })
    .eq('id', eventId);
  if (error) {
    await reportOperationalError('event-invite-link', error, { eventId });
    return { ok: false, error: 'Could not update the invite link. Try again.' };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/discover');
  return { ok: true };
}

/**
 * Turn the plan's public share link on or off.
 *
 * This is the kill switch for `/i/<share_token>` — the link a host texts to
 * people who aren't on the plan yet. It is separate from `open_table` (which
 * governs the older ask-to-join flow) and defaults to ON in the database, not in
 * a client `useState`: the previous "default invite links to on" fix only
 * changed the creation wizard's initial state, so every plan created any other
 * way (cloned, recurring, ritual) kept a dead link.
 */
export async function setEventShareLink(
  eventId: string,
  active: boolean,
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
    .update({ share_link_active: active })
    .eq('id', eventId);
  if (error) {
    return reportAndFail(
      'SB-SHARE-SAVE',
      'event-share-link',
      error,
      { eventId },
      'Could not update the invite link. Try again.',
    );
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Mint a fresh share token, invalidating any link already sent. Host/co-host
 * only — enforced inside the security-definer function, which is why the
 * caller id is passed explicitly (auth.uid() is null under the service role).
 */
export async function rotateEventShareLink(
  eventId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;

  const admin = createAdminClient();
  const { error } = await admin.rpc('rotate_event_share_token', {
    p_event: eventId,
    p_user: user.id,
  });
  if (error) {
    return reportAndFail(
      'SB-SHARE-SAVE',
      'event-share-link-rotate',
      error,
      { eventId },
      'Could not refresh the invite link. Try again.',
    );
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function confirmEvent(eventId: string): Promise<void> {
  const { user } = await requireUserOrRedirect();
  if (!(await isEventManager(user.id, eventId))) return;
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isEventManager(user.id, eventId))) return;
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
  if (!(await isEventManager(user.id, eventId))) return;
  const admin = createAdminClient();

  const cleanReason = reason?.trim().slice(0, 2000) || null;
  const trimmedVoice = voiceUrl?.trim();
  const cleanVoiceUrl =
    trimmedVoice && isValidMediaRef(trimmedVoice) ? trimmedVoice : null;

  const { data: event } = await admin
    .from('events')
    .select('title')
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
    .select('invitee_id, guest_contact')
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

  const guestContacts = rows
    .filter((r) => !r.invitee_id)
    .map((r) => r.guest_contact as string | null)
    .filter((c): c is string => Boolean(c));
  const reasonLine = cleanReason ? `\n\nReason: ${cleanReason}` : '';
  const guestEmails = guestContacts
    .filter((c) => looksLikeEmail(c))
    .map((to) => ({
      to,
      subject: `Cancelled: ${title}`,
      text: `${title} has been cancelled. Apologies for the change of plans.${reasonLine}\n\n- Switchboard`,
    }));
  if (guestEmails.length > 0) await sendEmails(guestEmails);
  const guestSms = guestContacts
    .filter((c) => looksLikePhoneNumber(c))
    .map((to) => ({
      to,
      body: `${title} on Switchboard has been cancelled.${cleanReason ? ` Reason: ${cleanReason}` : ''}`,
    }));
  if (guestSms.length > 0) await sendSmsMessages(guestSms);

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
    await reportOperationalError('event.delete', error, { eventId, userId: user.id });
    return { ok: false, error: 'Could not permanently delete this plan.' };
  }
  if (outcome === 'not_found') return { ok: false, error: 'That plan was not found.' };
  if (outcome === 'forbidden') {
    return { ok: false, error: 'Only the primary host can permanently delete this plan.' };
  }
  if (outcome === 'accepted_guests') {
    return {
      ok: false,
      error: 'Cancel the plan first so everyone who accepted is notified.',
    };
  }
  if (outcome !== 'deleted') {
    return { ok: false, error: 'Could not permanently delete this plan.' };
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
  if (!(await isEventManager(user.id, eventId))) return;
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

/**
 * Primary host adds a co-host by handle. Co-hosts share host powers (editing
 * the plan, approving join requests, confirming/cancelling). Only the primary
 * host can manage the co-host list — RLS enforces that on event_cohosts.
 */
export async function addCoHost(
  eventId: string,
  handle: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '');
  if (!cleanHandle) return { ok: false, error: 'Enter a handle.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', cleanHandle)
    .maybeSingle();
  if (!profile) return { ok: false, error: 'No one with that handle.' };
  if (profile.id === user.id) {
    return { ok: false, error: 'You’re already the host.' };
  }

  const { error } = await supabase.from('event_cohosts').insert({
    event_id: eventId,
    cohost_id: profile.id,
    added_by: user.id,
  });
  if (error) {
    const already = error.code === '23505';
    return {
      ok: false,
      error: already ? 'They’re already a co-host.' : error.message,
    };
  }

  // Bring them into the Living Room so they can coordinate. Best-effort:
  // they may already be a member.
  const { data: event } = await supabase
    .from('events')
    .select('room_id')
    .eq('id', eventId)
    .maybeSingle();
  if (event?.room_id) {
    await supabase
      .from('room_members')
      .insert({ room_id: event.room_id, member_id: profile.id });
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function removeCoHost(
  eventId: string,
  cohostId: string,
): Promise<void> {
  const { supabase } = await requireUserOrRedirect();
  await supabase
    .from('event_cohosts')
    .delete()
    .eq('event_id', eventId)
    .eq('cohost_id', cohostId);
  revalidatePath(`/events/${eventId}`);
}
