'use server';

import type { ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { isValidMediaRef } from '@/lib/server/media';

export interface ThreadResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
}

interface CommentInput {
  body?: string;
  voiceUrl?: string | null;
  voiceDurationSeconds?: number | null;
}


/**
 * Post to an event thread — text, a voice note, or both. Two-way commentary,
 * unlike host announcements — anyone who's RSVP'd (accepted their invite), plus
 * the host and co-hosts, can add to it. The RLS insert policy is the real gate:
 * a non-RSVP'd viewer's write is refused here even though the composer never
 * renders for them.
 */
export async function postComment(
  eventId: string,
  input: CommentInput | string,
): Promise<ThreadResult> {
  // Back-compat: a bare string is treated as the body.
  const normalized: CommentInput = typeof input === 'string' ? { body: input } : input;
  const trimmed = normalized.body?.trim() ?? '';
  const voiceUrl = normalized.voiceUrl?.trim() || null;
  const duration =
    typeof normalized.voiceDurationSeconds === 'number' &&
    Number.isFinite(normalized.voiceDurationSeconds)
      ? Math.max(0, Math.min(600, Math.round(normalized.voiceDurationSeconds)))
      : null;

  if (!trimmed && !voiceUrl) return { ok: false, error: 'Add a message or a voice note.' };
  if (trimmed.length > 2000) return { ok: false, error: 'That’s a bit long' };
  if (voiceUrl && !isValidMediaRef(voiceUrl)) {
    return { ok: false, error: 'That voice note could not be saved.' };
  }

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // RLS: only accepted invitees / host / co-hosts may insert. A locked viewer
  // fails cleanly here.
  const { error } = await supabase.from('event_comments').insert({
    event_id: eventId,
    author_id: user.id,
    body: trimmed || null,
    voice_url: voiceUrl,
    voice_duration_seconds: voiceUrl ? duration : null,
  });
  if (error) {
    return {
      ok: false,
      error: 'You need to RSVP before you can join the thread.',
    };
  }

  // Nudge the people already in the conversation — the host and prior
  // commenters — not everyone who's coming. Best-effort; the comment is saved.
  try {
    await notifyThreadParticipants(eventId, user.id, trimmed, Boolean(voiceUrl));
  } catch (notifyError) {
    console.error('Thread notify failed', notifyError);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Remove a comment: its author, or the host / co-host moderating the thread. */
export async function deleteComment(
  eventId: string,
  commentId: string,
): Promise<ThreadResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  // RLS enforces author-or-host; this is a no-op row-count for anyone else.
  const { error } = await supabase
    .from('event_comments')
    .delete()
    .eq('id', commentId)
    .eq('event_id', eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

async function notifyThreadParticipants(
  eventId: string,
  authorId: string,
  body: string,
  hasVoice: boolean,
): Promise<void> {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, host_id')
    .eq('id', eventId)
    .single();
  if (!event) return;

  const { data: priorComments } = await admin
    .from('event_comments')
    .select('author_id')
    .eq('event_id', eventId);

  const participants = new Set<string>([event.host_id]);
  for (const row of priorComments ?? []) {
    if (row.author_id) participants.add(row.author_id);
  }
  participants.delete(authorId);
  if (participants.size === 0) return;

  const preview = body
    ? body.length > 140
      ? `${body.slice(0, 139)}…`
      : body
    : hasVoice
      ? '🎤 Voice note'
      : '';
  await notifyUsers([...participants], {
    kind: 'event_comment',
    title: `New comment · ${event.title}`,
    body: preview,
    url: `/events/${event.id}`,
  });
}
