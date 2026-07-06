'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import type { EventTheme, InviteMode } from '@/lib/types';

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

export async function createEvent(input: CreateEventInput): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const title = input.title.trim();
  if (!title) redirect('/events/new?error=title');
  if (input.invitees.length === 0) redirect('/events/new?error=invitees');

  // Every event gets a Living Room.
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ kind: 'event', title, created_by: user.id })
    .select('id')
    .single();
  if (roomError || !room) redirect('/events/new?error=save');

  await supabase
    .from('room_members')
    .insert({ room_id: room.id, member_id: user.id });

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      host_id: user.id,
      title,
      description: input.description,
      location_name: input.locationName,
      location_address: input.locationAddress,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      capacity: input.capacity,
      invite_mode: input.inviteMode,
      open_table: input.openTable && input.capacity !== null,
      status: input.enablePoll ? 'deciding' : 'inviting',
      show_invite_list: input.showInviteList,
      show_accepted: input.showAccepted,
      show_expired: input.showExpired,
      cover_url: input.coverUrl?.trim() || null,
      theme: input.theme ?? 'default',
      wishlist_url: input.wishlistUrl?.trim() || null,
      room_id: room.id,
    })
    .select('id')
    .single();
  if (eventError || !event) redirect('/events/new?error=save');

  const questions = (input.questions ?? [])
    .map((q) => ({ prompt: q.prompt.trim(), required: q.required }))
    .filter((q) => q.prompt.length > 0);
  if (questions.length > 0) {
    await supabase.from('event_questions').insert(
      questions.map((q, index) => ({
        event_id: event.id,
        prompt: q.prompt,
        required: q.required,
        position: index,
      })),
    );
  }

  const inviteRows = input.invitees.map((invitee, index) => ({
    event_id: event.id,
    invitee_id: invitee.profileId,
    guest_name: invitee.guestName ?? null,
    guest_contact: invitee.guestContact ?? null,
    position: index,
    group_stage: input.inviteMode === 'individual' ? index : invitee.groupStage,
    window_minutes: invitee.windowMinutes,
  }));

  const { error: inviteError } = await supabase.from('invites').insert(inviteRows);
  if (inviteError) redirect('/events/new?error=save');

  if (input.ritualId) {
    await supabase
      .from('rituals')
      .update({ last_planned_at: new Date().toISOString() })
      .eq('id', input.ritualId);
  }

  if (input.enablePoll) {
    await supabase.from('polls').insert({
      event_id: event.id,
      resolution: input.pollResolution,
      vote_deadline: input.voteDeadline,
      phase: 'suggesting',
    });
  } else {
    // Best-effort: the event and invites already exist. If kicking off the
    // cascade fails (e.g. admin credentials or push aren't configured), the
    // host must still land on their new event rather than hang — the sweep
    // will pick the cascade back up. Never let this abort the redirect below.
    try {
      await advanceEventCascade(event.id);
    } catch (cascadeError) {
      console.error('Failed to start cascade for new event', cascadeError);
    }
  }

  redirect(`/events/${event.id}`);
}

export async function confirmEvent(eventId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('events').update({ status: 'confirmed' }).eq('id', eventId);
  revalidatePath(`/events/${eventId}`);
}

export async function cancelEvent(eventId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('events').update({ status: 'cancelled' }).eq('id', eventId);
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

  const { data: room } = await supabase
    .from('rooms')
    .insert({ kind: 'event', title: source.title, created_by: user.id })
    .select('id')
    .single();
  if (room) {
    await supabase.from('room_members').insert({ room_id: room.id, member_id: user.id });
  }

  const { data: clone } = await supabase
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
    await supabase.from('invites').insert(
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
    await supabase.from('event_questions').insert(
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
  const { error } = await supabase
    .from('events')
    .update({ status: 'inviting' })
    .eq('id', eventId);
  if (!error) {
    await advanceEventCascade(eventId);
  }
  revalidatePath(`/events/${eventId}`);
}
