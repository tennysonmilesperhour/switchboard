'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { resolvePoll } from '@/lib/server/poll-runner';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
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

  const { data: isHost } = await supabase.rpc('is_event_host', {
    p_event: poll.event_id,
    p_user: user.id,
  });
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

  // Only accept a ballot for an option that actually belongs to this poll, and
  // only while voting is open — don't trust the client-supplied optionId/phase.
  const { data: option } = await supabase
    .from('poll_options')
    .select('poll_id')
    .eq('id', optionId)
    .maybeSingle();
  if (!option || option.poll_id !== pollId) {
    return { ok: false, error: 'That option is not on this poll.' };
  }
  const { data: pollRow } = await supabase
    .from('polls')
    .select('phase')
    .eq('id', pollId)
    .maybeSingle();
  if (pollRow?.phase !== 'voting') {
    return { ok: false, error: 'Voting is not open on this poll.' };
  }

  const { error } = await supabase.from('poll_votes').upsert({
    poll_id: pollId,
    option_id: optionId,
    voter_id: user.id,
    weight,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  // The event only, never the weight or option — individual votes stay private.
  await capture(user.id, ANALYTICS_EVENTS.pollVoted, { event_id: eventId });
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function openVoting(pollId: string, eventId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Host/co-host only (parity with closeVoting); RLS also enforces this, but
  // check here so a non-host gets a clean no-op rather than relying on it.
  const { data: isHost } = await supabase.rpc('is_event_host', {
    p_event: eventId,
    p_user: user.id,
  });
  if (!isHost) return;
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

  // Co-hosts share host powers (is_event_host covers both).
  const { data: isHost } = await supabase.rpc('is_event_host', {
    p_event: eventId,
    p_user: user.id,
  });
  if (!isHost) return;

  await resolvePoll(pollId);
  revalidatePath(`/events/${eventId}`);
}

export async function pickWinner(
  pollId: string,
  eventId: string,
  optionId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Host/co-host only (parity with closeVoting); RLS also enforces this.
  const { data: isHost } = await supabase.rpc('is_event_host', {
    p_event: eventId,
    p_user: user.id,
  });
  if (!isHost) return;
  await supabase
    .from('polls')
    .update({ phase: 'decided', winning_option_id: optionId })
    .eq('id', pollId);
  revalidatePath(`/events/${eventId}`);
}
