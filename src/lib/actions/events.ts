'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  advanceEventCascade,
  notifyCurrentInviteWave,
} from '@/lib/server/cascade-runner';
import { sendPushToUsers } from '@/lib/server/notify';
import type { EventTheme, InviteMode } from '@/lib/types';
import { reportOperationalError } from '@/lib/server/observability';
import { looksLikeEmail } from '@/lib/server/email';
import { normalizePhoneNumber } from '@/lib/phone';

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

async function resolveInvitees(
  invitees: WizardInvitee[],
): Promise<WizardInvitee[]> {
  const admin = createAdminClient();
  return Promise.all(
    invitees.map(async (invitee) => {
      if (invitee.profileId) return invitee;
      const contact = invitee.guestContact?.trim() || null;
      const handle =
        maybeHandle(contact) ?? maybeHandle(invitee.guestName, { requireAt: true });
      const phone = normalizePhoneNumber(contact);

      let profileId: string | null = null;
      if (handle) {
        const { data } = await admin
          .from('profiles')
          .select('id')
          .eq('handle', handle)
          .maybeSingle();
        profileId = data?.id ?? null;
      } else if (phone) {
        const { data } = await admin
          .from('profiles')
          .select('id')
          .eq('contact_phone_normalized', phone)
          .limit(1)
          .maybeSingle();
        profileId = data?.id ?? null;
      } else if (contact && looksLikeEmail(contact)) {
        const { data } = await admin
          .from('profiles')
          .select('id')
          .ilike('contact_email', contact)
          .limit(1)
          .maybeSingle();
        profileId = data?.id ?? null;
      }

      if (!profileId) return invitee;
      return {
        ...invitee,
        profileId,
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

  const invitees = await resolveInvitees(input.invitees);

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

export interface AddInviteesResult {
  ok: boolean;
  error?: string;
  /** How many new invitees were appended to the cascade. */
  added?: number;
  /** Handles that couldn't be added, each with a short reason. */
  skipped?: Array<{ handle: string; reason: string }>;
}

/**
 * Append people to an already-live cascade by handle. New invitees join the
 * back of the line as `queued` and go out when it's their turn (individual
 * mode) or as a fresh trailing wave (group / all-at-once). Host/co-host only,
 * and only while invitations are in motion.
 */
export async function addInviteesByHandle(
  eventId: string,
  handles: string[],
): Promise<AddInviteesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!(await canManageEvent(user.id, eventId))) {
    return { ok: false, error: 'Only the host can add people.' };
  }

  // Normalize + de-duplicate the requested handles, keeping only well-formed ones.
  const cleaned: string[] = [];
  const seen = new Set<string>();
  const skipped: Array<{ handle: string; reason: string }> = [];
  for (const raw of handles) {
    const handle = maybeHandle(raw);
    if (!handle) {
      const shown = String(raw ?? '').trim();
      if (shown) skipped.push({ handle: shown, reason: 'not a valid handle' });
      continue;
    }
    if (seen.has(handle)) continue;
    seen.add(handle);
    cleaned.push(handle);
  }
  if (cleaned.length === 0) {
    return { ok: false, error: 'Add at least one handle.', skipped };
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, status, invite_mode, capacity')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Plan not found.' };
  if (event.status !== 'inviting') {
    return {
      ok: false,
      error: 'You can only add people while invitations are in motion.',
    };
  }

  // Resolve handles to real profiles.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, handle')
    .in('handle', cleaned);
  const idByHandle = new Map(
    (profiles ?? []).map((p) => [p.handle as string, p.id as string]),
  );

  // Existing invites: compute append positions/stage and skip anyone already on.
  const { data: existing } = await admin
    .from('invites')
    .select('invitee_id, position, group_stage')
    .eq('event_id', eventId);
  const rows = existing ?? [];
  const already = new Set(
    rows.map((r) => r.invitee_id).filter((id): id is string => Boolean(id)),
  );
  let nextPosition = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
  const nextStage = rows.reduce((max, r) => Math.max(max, r.group_stage), -1) + 1;

  const toInsert: Array<{
    event_id: string;
    invitee_id: string;
    position: number;
    group_stage: number;
    status: 'queued';
  }> = [];
  for (const handle of cleaned) {
    const profileId = idByHandle.get(handle);
    if (!profileId) {
      skipped.push({ handle, reason: 'no one with that handle' });
      continue;
    }
    if (profileId === user.id) {
      skipped.push({ handle, reason: 'that’s you' });
      continue;
    }
    if (already.has(profileId)) {
      skipped.push({ handle, reason: 'already invited' });
      continue;
    }
    already.add(profileId);
    toInsert.push({
      event_id: eventId,
      invitee_id: profileId,
      position: nextPosition++,
      // Individual mode ignores stage; grouped modes get one new trailing wave.
      group_stage: event.invite_mode === 'individual' ? 0 : nextStage,
      status: 'queued',
    });
  }

  if (toInsert.length === 0) {
    return { ok: false, error: 'No new people to add.', skipped };
  }

  const { error } = await admin.from('invites').insert(toInsert);
  if (error) {
    await reportOperationalError('add-invitees', error, { eventId });
    return { ok: false, error: 'Could not add people. Try again.', skipped };
  }

  // Send immediately if the cascade is ready for them (e.g. individual mode
  // with no live invite, or a resolved prior wave). The cron sweep is the backstop.
  try {
    await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('add-invitees-cascade', cascadeError, { eventId });
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, added: toInsert.length, skipped };
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
      await sendPushToUsers(recipients, {
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
  revalidatePath(`/events/${eventId}`);
}

export async function cancelEvent(eventId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await canManageEvent(user.id, eventId))) return;
  const admin = createAdminClient();
  await admin.from('events').update({ status: 'cancelled' }).eq('id', eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
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

  const { data: source } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (!source || source.host_id !== user.id) redirect('/plans');

  // Writes go through the service-role client for the same reason as
  // createEvent: the host can't read back a room they don't yet belong to
  // under RLS. Ownership is pinned to the authenticated user on every row.
  const admin = createAdminClient();

  const { data: room } = await admin
    .from('rooms')
    .insert({ kind: 'event', title: source.title, created_by: user.id })
    .select('id')
    .single();
  if (room) {
    await admin.from('room_members').insert({ room_id: room.id, member_id: user.id });
  }

  const { data: clone } = await admin
    .from('events')
    .insert({
      host_id: user.id,
      title: source.title,
      description: source.description,
      location_name: source.location_name,
      location_address: source.location_address,
      starts_at: null, // new date TBD - the group can settle it in the room
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
      room_id: room?.id ?? null,
    })
    .select('id')
    .single();
  if (!clone) redirect(`/events/${eventId}`);

  const { data: priorInvites } = await supabase
    .from('invites')
    .select('invitee_id, guest_name, guest_contact, position, group_stage, window_minutes, decline_note')
    .eq('event_id', eventId)
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
    .eq('event_id', eventId);
  if (questions && questions.length > 0) {
    await admin.from('event_questions').insert(
      questions.map((q) => ({ ...q, event_id: clone.id })),
    );
  }

  try {
    await advanceEventCascade(clone.id);
  } catch (cascadeError) {
    console.error('Failed to start cascade for run-it-back', cascadeError);
  }

  redirect(`/events/${clone.id}`);
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
