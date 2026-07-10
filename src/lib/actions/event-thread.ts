'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import type { SwitchboardEvent } from '@/lib/types';

export interface ThreadResult {
  ok: boolean;
  error?: string;
}

/**
 * Post to an event thread. Two-way commentary, unlike host announcements —
 * anyone who's RSVP'd (accepted their invite), plus the host and co-hosts, can
 * add to it. The RLS insert policy is the real gate: a non-RSVP'd viewer's write
 * is refused here even though the composer never renders for them.
 */
export async function postComment(
  eventId: string,
  body: string,
): Promise<ThreadResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Write something first' };
  if (trimmed.length > 2000) return { ok: false, error: 'That’s a bit long' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  // RLS: only accepted invitees / host / co-hosts may insert. A locked viewer
  // fails cleanly here.
  const { error } = await supabase
    .from('event_comments')
    .insert({ event_id: eventId, author_id: user.id, body: trimmed });
  if (error) {
    return {
      ok: false,
      error: 'You need to RSVP before you can join the thread.',
    };
  }

  // Nudge the people already in the conversation — the host and prior
  // commenters — not everyone who's coming. Best-effort; the comment is saved.
  try {
    await notifyThreadParticipants(eventId, user.id, trimmed);
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

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
): Promise<void> {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, host_id')
    .eq('id', eventId)
    .single<Pick<SwitchboardEvent, 'id' | 'title'> & { host_id: string }>();
  if (!event) return;

  const { data: priorComments } = await admin
    .from('event_comments')
    .select('author_id')
    .eq('event_id', eventId);

  const participants = new Set<string>([event.host_id]);
  for (const row of priorComments ?? []) {
    if (row.author_id) participants.add(row.author_id as string);
  }
  participants.delete(authorId);
  if (participants.size === 0) return;

  const preview = body.length > 140 ? `${body.slice(0, 139)}…` : body;
  await notifyUsers([...participants], {
    kind: 'event_comment',
    title: `New comment · ${event.title}`,
    body: preview,
    url: `/events/${event.id}`,
  });
}
