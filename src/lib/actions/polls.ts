'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { resolvePoll } from '@/lib/server/poll-runner';
import type { Weight } from '@/lib/engine/scoring';

export async function addSuggestion(
  pollId: string,
  eventId: string,
  label: string,
  detail?: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: 'Suggestion is empty' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { data: poll } = await supabase
    .from('polls')
    .select('phase, event_id, allow_suggestions')
    .eq('id', pollId)
    .single();
  if (!poll || poll.phase === 'decided') {
    return { ok: false, error: 'Voting has closed' };
  }

  const { data: event } = await supabase
    .from('events')
    .select('host_id')
    .eq('id', poll.event_id)
    .single();
  const isHost = event?.host_id === user.id;
  if (!poll.allow_suggestions && !isHost) {
    return { ok: false, error: 'Only the host can add options' };
  }

  const { error } = await supabase.from('poll_options').insert({
    poll_id: pollId,
    label: trimmed,
    detail: detail?.trim() || null,
    source: isHost ? 'host' : 'guests',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function castVote(
  pollId: string,
  eventId: string,
  optionId: string,
  weight: Weight,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { error } = await supabase.from('poll_votes').upsert({
    poll_id: pollId,
    option_id: optionId,
    voter_id: user.id,
    weight,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function openVoting(pollId: string, eventId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('polls').update({ phase: 'voting' }).eq('id', pollId);
  revalidatePath(`/events/${eventId}`);
}

/**
 * Close voting. Depending on the poll's resolution mode this either
 * auto-picks the winner, hands the host the finalists, or opens a runoff.
 * Host-only; the actual resolution logic is shared with the cron sweep.
 */
export async function closeVoting(pollId: string, eventId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: event } = await supabase
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .single();
  if (event?.host_id !== user.id) return;

  await resolvePoll(pollId);
  revalidatePath(`/events/${eventId}`);
}

export async function pickWinner(
  pollId: string,
  eventId: string,
  optionId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('polls')
    .update({ phase: 'decided', winning_option_id: optionId })
    .eq('id', pollId);
  revalidatePath(`/events/${eventId}`);
}
