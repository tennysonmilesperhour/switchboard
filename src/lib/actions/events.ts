'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  advanceEventCascade,
  notifyCurrentInviteWave,
} from '@/lib/server/cascade-runner';
import type { EventTheme, InviteMode } from '@/lib/types';
import { reportOperationalError } from '@/lib/server/observability';

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

  const { data: eventId, error } = await supabase.rpc('create_event_atomic', {
    p_input: { ...input, title },
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
