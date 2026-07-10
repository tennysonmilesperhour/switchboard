'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import type { SwitchboardEvent } from '@/lib/types';

export interface CommentResult {
  ok: boolean;
  error?: string;
}

interface CommentInput {
  body?: string;
  voiceUrl?: string | null;
  voiceDurationSeconds?: number | null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Post a comment under a plan — text, a voice note, or both. Anyone who can see
 * the event (host or a live invitee) may post; RLS enforces that. Two-way,
 * unlike host-only Announcements.
 */
export async function postComment(
  eventId: string,
  input: CommentInput,
): Promise<CommentResult> {
  const body = input.body?.trim() ?? '';
  const voiceUrl = input.voiceUrl?.trim() || null;
  const duration =
    typeof input.voiceDurationSeconds === 'number' && Number.isFinite(input.voiceDurationSeconds)
      ? Math.max(0, Math.min(600, Math.round(input.voiceDurationSeconds)))
      : null;

  if (!body && !voiceUrl) return { ok: false, error: 'Add a message or a voice note.' };
  if (body.length > 2000) return { ok: false, error: 'That’s a bit long.' };
  if (voiceUrl && !isHttpsUrl(voiceUrl)) return { ok: false, error: 'That voice note could not be saved.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  // RLS enforces can_view_event(event_id) — a stranger's insert fails cleanly.
  const { error } = await supabase.from('event_comments').insert({
    event_id: eventId,
    author_id: user.id,
    body: body || null,
    voice_url: voiceUrl,
    voice_duration_seconds: voiceUrl ? duration : null,
  });
  if (error) return { ok: false, error: error.message };

  // Fan-out is best-effort — the comment is already saved.
  try {
    await notifyThread(eventId, user.id, body, Boolean(voiceUrl));
  } catch (notifyError) {
    console.error('Comment notify failed', notifyError);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<CommentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  // RLS allows deletion only by the author or the event host.
  const { data, error } = await supabase
    .from('event_comments')
    .delete()
    .eq('id', commentId)
    .select('event_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data?.event_id) revalidatePath(`/events/${data.event_id}`);
  return { ok: true };
}

/** Notify the host and everyone who's in (except the author) about a new comment. */
async function notifyThread(
  eventId: string,
  authorId: string,
  body: string,
  hasVoice: boolean,
): Promise<void> {
  const admin = createAdminClient();

  const [{ data: event }, { data: author }, { data: accepted }] = await Promise.all([
    admin
      .from('events')
      .select('title, host_id')
      .eq('id', eventId)
      .single<Pick<SwitchboardEvent, 'title' | 'host_id'>>(),
    admin.from('profiles').select('display_name').eq('id', authorId).maybeSingle(),
    admin
      .from('invites')
      .select('invitee_id')
      .eq('event_id', eventId)
      .eq('status', 'accepted'),
  ]);
  if (!event) return;

  const recipients = new Set<string>();
  if (event.host_id) recipients.add(event.host_id);
  for (const row of accepted ?? []) {
    if (row.invitee_id) recipients.add(row.invitee_id as string);
  }
  recipients.delete(authorId);
  if (recipients.size === 0) return;

  const name = author?.display_name ?? 'Someone';
  const preview = body
    ? body.length > 120
      ? `${body.slice(0, 117)}…`
      : body
    : hasVoice
      ? '🎤 Voice note'
      : '';

  await notifyUsers([...recipients], {
    kind: 'event_comment',
    title: `${name} commented on ${event.title}`,
    body: preview,
    url: `/events/${eventId}`,
  });
}
