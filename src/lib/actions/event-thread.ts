'use server';

import { failure, validation, type ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { isValidMediaRef } from '@/lib/server/media';
import { reportAndFail } from '@/lib/server/observability';

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
  /** The comment this one answers, when it is a reply. */
  replyToId?: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


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

  if (!trimmed && !voiceUrl) return validation('Add a message or a voice note.');
  if (trimmed.length > 2000) return validation('That’s a bit long');
  if (voiceUrl && !isValidMediaRef(voiceUrl)) {
    return validation('That voice note could not be saved.');
  }
  const replyToId = normalized.replyToId?.trim() || null;
  if (replyToId && !UUID_PATTERN.test(replyToId)) {
    return validation('That message is no longer here to reply to.');
  }

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // The comment being answered has to be one this person can read, on this
  // plan. The trigger refuses a cross-plan pointer too; checking here turns
  // that into a sentence rather than a database error.
  let replyTarget: { author_id: string } | null = null;
  if (replyToId) {
    const { data: parent } = await supabase
      .from('event_comments')
      .select('author_id')
      .eq('id', replyToId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!parent) return validation('That message is no longer here to reply to.');
    replyTarget = parent;
  }

  // RLS: only accepted invitees / host / co-hosts may insert. A locked viewer
  // fails cleanly here.
  const { error } = await supabase.from('event_comments').insert({
    event_id: eventId,
    author_id: user.id,
    body: trimmed || null,
    voice_url: voiceUrl,
    voice_duration_seconds: voiceUrl ? duration : null,
    reply_to_id: replyToId,
  });
  if (error) {
    if (error.code === '42501') {
      return failure('SB-PERM-DENIED', 'You need to RSVP before you can join the thread.');
    }
    return reportAndFail('SB-THREAD-SAVE', 'event-thread.send', error, { eventId });
  }

  // Nudge the people already in the conversation — the host and prior
  // commenters — not everyone who's coming. Best-effort; the comment is saved.
  try {
    await notifyThreadParticipants(eventId, user.id, trimmed, Boolean(voiceUrl), {
      repliedToId: replyTarget?.author_id ?? null,
    });
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
  if (error) {
    return reportAndFail('SB-THREAD-SAVE', 'event-thread.react', error, {
      eventId,
      commentId,
    });
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

async function notifyThreadParticipants(
  eventId: string,
  authorId: string,
  body: string,
  hasVoice: boolean,
  options: { repliedToId: string | null } = { repliedToId: null },
): Promise<void> {
  const admin = createAdminClient();
  const [{ data: event }, { data: author }] = await Promise.all([
    admin.from('events').select('id, title, host_id').eq('id', eventId).single(),
    admin.from('profiles').select('display_name').eq('id', authorId).maybeSingle(),
  ]);
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

  const preview = body
    ? body.length > 140
      ? `${body.slice(0, 139)}…`
      : body
    : hasVoice
      ? '🎤 Voice note'
      : '';
  const url = `/events/${event.id}`;

  // The person being answered hears that first and by name: "replied to you"
  // is the notification that makes a reply feel like one. They are then left
  // out of the general nudge so one message never buzzes them twice.
  const repliedTo = options.repliedToId;
  if (repliedTo && repliedTo !== authorId) {
    participants.delete(repliedTo);
    await notifyUsers([repliedTo], {
      kind: 'event_comment',
      title: `${author?.display_name ?? 'Someone'} replied to you · ${event.title}`,
      body: preview,
      url,
    });
  }

  if (participants.size === 0) return;
  await notifyUsers([...participants], {
    kind: 'event_comment',
    title: `New comment · ${event.title}`,
    body: preview,
    url,
  });
}
