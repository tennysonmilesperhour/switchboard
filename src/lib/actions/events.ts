'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import type { InviteMode } from '@/lib/types';

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
      room_id: room.id,
    })
    .select('id')
    .single();
  if (eventError || !event) redirect('/events/new?error=save');

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
    await advanceEventCascade(event.id);
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
