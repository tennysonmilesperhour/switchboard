'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  advanceEventCascade,
  notifyCurrentInviteWave,
} from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import type { EventTheme, InviteMode, RecurrenceKind } from '@/lib/types';
import {
  nextOccurrenceAfter,
  normalizeCustomInterval,
} from '@/lib/engine/recurrence';
import { reportOperationalError } from '@/lib/server/observability';
import { looksLikeEmail, sendEmails } from '@/lib/server/email';
import { looksLikePhoneNumber, sendSmsMessages } from '@/lib/server/sms';
import { normalizePhoneNumber } from '@/lib/phone';
import { suggestWindow } from '@/lib/engine/windows';
import { parseInviteEntries, type ParsedInviteEntry } from '@/lib/invite-entry';

/** Primary host or a co-host — the people allowed to manage an event. */
async function canManageEvent(userId: string, eventId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.rpc('is_event_host', {
    p_event: eventId,
    p_user: userId,
  });
  return Boolean(data);
}

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
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  inviteMode: InviteMode;
  openTable: boolean;
  showInviteList: boolean;
  showAccepted: boolean;
  showExpired: boolean;
  enablePoll: boolean;
  pollResolution: 'host_pick' | 'auto' | 'runoff';
  voteDeadline: string | null;
  /** Presentation */
  coverUrl?: string | null;
  theme?: EventTheme;
  wishlistUrl?: string | null;
  /** How often the plan repeats; day-count only when recurrence is 'custom'. */
  recurrence?: RecurrenceKind;
  recurrenceIntervalDays?: number | null;
  /** Host-defined RSVP questions, in order. */
  questions?: Array<{ prompt: string; required: boolean }>;
  /** Standing ritual this plan fulfills, if any. */
  ritualId?: string | null;
  /** Already in host-preferred order. */
  invitees: WizardInvitee[];
}

export interface CreateEventResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

function createEventError(error: string): CreateEventResult {
  return { ok: false, error };
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

export async function createEvent(input: CreateEventInput): Promise<CreateEventResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const title = input.title.trim();
  if (!title) return createEventError('Please give your plan a name before sending it.');
  if (input.invitees.length === 0) {
    return createEventError('Add at least one person to invite before sending.');
  }

  const invitees = await resolveInvitees(supabase, input.invitees);

  const { data: eventId, error } = await supabase.rpc('create_event_atomic', {
    p_input: { ...input, title, invitees },
  });
  if (error || typeof eventId !== 'string') {
    await reportOperationalError('event-create', error ?? 'Missing event id', {
      userId: user.id,
    });
    return createEventError('Something went wrong publishing your plan. Nothing was saved.');
  }

  if (!input.enablePoll) {
    try {
      await notifyCurrentInviteWave(eventId);
    } catch (cascadeError) {
      await reportOperationalError('event-initial-delivery', cascadeError, { eventId });
    }
  }

  return { ok: true, eventId };
}

export interface AddPeopleResult {
  ok: boolean;
  error?: string;
  /** How many new invitees were appended to the cascade. */
  added?: number;
  /** Entries that couldn't be added, each with a short reason. */
  skipped?: Array<{ entry: string; reason: string }>;
}

/** One resolved thing to insert: either a member (profileId) or a guest. */
type ResolvedAddition =
  | { kind: 'member'; profileId: string; label: string }
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
    if (match) return { kind: 'member', profileId: match.id, label: parsed.display };
    return { kind: 'guest', name: parsed.value, contact: parsed.value, label: parsed.display };
  }
  if (parsed.kind === 'phone') {
    const match = await resolveProfileByContact(supabase, parsed.value);
    if (match) return { kind: 'member', profileId: match.id, label: parsed.display };
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!(await canManageEvent(user.id, eventId))) {
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
    await reportOperationalError('add-people', error, { eventId });
    return { ok: false, error: 'Could not add people. Try again.', skipped };
  }

  // Send immediately if the cascade is ready for them (e.g. individual mode
  // with no live invite, or a resolved prior wave). The cron sweep is the backstop.
  try {
    await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('add-people-cascade', cascadeError, { eventId });
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, added: toInsert.length, skipped };
}

/**
 * Withdraw a not-yet-accepted invite (queued, live, expired, declined, …).
 * Accepted attendees can't be silently dropped this way. Advances the cascade
 * so the next person goes out if a live slot just opened. Host/co-host only.
 */
export async function removeInvite(
  eventId: string,
  inviteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!(await canManageEvent(user.id, eventId))) {
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
    return { ok: false, error: 'They already accepted — cancel the plan or lower capacity instead.' };
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
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!(await canManageEvent(user.id, eventId))) {
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

  try {
    await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('resend-invite-cascade', cascadeError, { eventId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export interface UpdateEventInput {
  title: string;
  description: string | null;
  locationName: string | null;
  locationAddress: string | null;
  startsAt: string | null;
  endsAt: string | null;
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
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!(await canManageEvent(user.id, eventId))) {
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
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!(await canManageEvent(user.id, eventId))) {
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
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!(await canManageEvent(user.id, eventId))) {
    return { ok: false, error: 'Only the host can edit this plan.' };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give your plan a name.' };
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
    return { ok: false, error: 'Capacity must be a whole number of at least 1.' };
  }

  let wishlistUrl: string | null = null;
  if (input.wishlistUrl?.trim()) {
    const value = input.wishlistUrl.trim();
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(candidate);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')) {
        wishlistUrl = url.toString();
      }
    } catch {
      wishlistUrl = null;
    }
  }

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
      capacity: input.capacity,
      wishlist_url: wishlistUrl,
    })
    .eq('id', eventId);
  if (error) {
    await reportOperationalError('event-update', error, { eventId });
    return { ok: false, error: 'Could not save your changes. Try again.' };
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

export async function confirmEvent(eventId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await canManageEvent(user.id, eventId))) return;
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

export async function cancelEvent(
  eventId: string,
  reason?: string,
  voiceUrl?: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await canManageEvent(user.id, eventId))) return;
  const admin = createAdminClient();

  const cleanReason = reason?.trim().slice(0, 2000) || null;
  const cleanVoiceUrl =
    voiceUrl && /^https:\/\//.test(voiceUrl.trim()) ? voiceUrl.trim() : null;

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
      ? ' The host left a voice note — tap to listen.'
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
      text: `${title} has been cancelled. Apologies for the change of plans.${reasonLine}\n\n— Switchboard`,
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
    .select('prompt, required, position')
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await canManageEvent(user.id, eventId))) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .update({ status: 'inviting' })
    .eq('id', eventId);
  if (!error) {
    await advanceEventCascade(eventId);
  }
  revalidatePath(`/events/${eventId}`);
}

/**
 * Primary host adds a co-host by handle. Co-hosts share host powers (editing
 * the plan, approving join requests, confirming/cancelling). Only the primary
 * host can manage the co-host list — RLS enforces that on event_cohosts.
 */
export async function addCoHost(
  eventId: string,
  handle: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  await supabase
    .from('event_cohosts')
    .delete()
    .eq('event_id', eventId)
    .eq('cohost_id', cohostId);
  revalidatePath(`/events/${eventId}`);
}
