'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { extractItems, extractWithRules } from '@/lib/ai/extract';
import { isOwnPublicStorageUrl } from '@/lib/server/media';
import { notifyRoomActivity } from '@/lib/server/notify';
import { reportAndFail } from '@/lib/server/observability';
import { checkRateLimit } from '@/lib/server/rate-limit';

/** Mirrors the CHECK on `messages.body`. */
const MAX_MESSAGE_LENGTH = 4000;

async function notifyRoom(roomId: string, senderId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: room } = await admin
    .from('rooms')
    .select('title')
    .eq('id', roomId)
    .maybeSingle();
  if (room) await notifyRoomActivity(roomId, room.title, senderId);
}

export async function sendMessage(
  roomId: string,
  body: string,
): Promise<ActionResult> {
  const trimmed = body.trim();
  if (!trimmed) return validation('Empty message');
  // messages.body is CHECKed at 4000 characters. Past that the insert failed
  // as an operational SB-ROOM-SAVE telling the sender to reload and retry,
  // which could never work.
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return validation('That message is too long. Keep it under 4,000 characters, or split it in two.');
  }

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: message, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, sender_id: user.id, body: trimmed })
    .select('id')
    .single();
  if (error) return reportAndFail('SB-ROOM-SAVE', 'room.message', error, { roomId });

  notifyRoom(roomId, user.id).catch((notifyError) =>
    console.error('Room notification failed', notifyError),
  );

  // Quietly file useful information after the action response. Next's `after`
  // keeps the invocation alive for the promise without making the sender wait
  // for a model call. Organization remains best-effort.
  after(async () => {
    try {
      // The limit protects the model budget, not the filing: past it, the free
      // pattern rules still file links, addresses and tasks. It used to file
      // nothing at all, so the busiest member of a room during the event itself
      // - the moment it matters - stopped getting anything sorted.
      const canExtract = await checkRateLimit(`ai:extract:${user.id}`, 60, 60 * 60);
      const items = canExtract ? await extractItems(trimmed) : extractWithRules(trimmed);
      if (items.length > 0) {
        const admin = createAdminClient();
        await admin.from('room_items').insert(
          items.map((item) => ({
            room_id: roomId,
            message_id: message.id,
            kind: item.kind,
            title: item.title,
            detail: item.detail,
            url: item.url,
            created_by: user.id,
          })),
        );
      }
    } catch {
      // Organization is a bonus, never a blocker.
    }
  });

  return { ok: true };
}

export async function sendPhotoMessage(
  roomId: string,
  imageUrl: string,
  caption?: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Only accept a URL we minted into our own public media bucket — never an
  // arbitrary attacker-chosen origin pasted into the field.
  if (!isOwnPublicStorageUrl(imageUrl, ['media'])) {
    return validation('Unsupported image.');
  }
  const title = caption?.trim().slice(0, 120) || 'Photo';

  // Insert through the member's own client so message RLS proves room
  // membership before anything is written.
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_id: user.id,
      body: caption?.trim().slice(0, 4000) || '📷 Photo',
      image_url: imageUrl,
    })
    .select('id')
    .single();
  if (error) return reportAndFail('SB-ROOM-SAVE', 'room.image', error, { roomId });

  notifyRoom(roomId, user.id).catch((notifyError) =>
    console.error('Room notification failed', notifyError),
  );

  // File it into the Photos tab. Best-effort, mirrors the auto-filing path —
  // membership was already proven by the message insert above.
  try {
    const admin = createAdminClient();
    await admin.from('room_items').insert({
      room_id: roomId,
      message_id: message.id,
      kind: 'photo',
      title,
      url: imageUrl,
      created_by: user.id,
    });
  } catch {
    // The gallery is a bonus, never a blocker.
  }

  return { ok: true };
}

/**
 * Tick a task off, or back on.
 *
 * Returned nothing, and the room wrapped the call in a `catch` for an error
 * that could never arrive: a refused update comes back as `{ error }` or as
 * zero rows, never as a throw, so a failed tick left the box checked on one
 * phone and unchecked for everyone else with no word said.
 */
export async function toggleTask(
  itemId: string,
  roomId: string,
  done: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase
    .from('room_items')
    .update({ done })
    .eq('id', itemId)
    .eq('room_id', roomId)
    .select('id');
  if (error) return reportAndFail('SB-ROOM-SAVE', 'room.task', error, { roomId, itemId });
  if (!data || data.length === 0) return failure('SB-ROOM-SAVE');
  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
}

export async function markRoomRead(roomId: string): Promise<void> {
  const auth = await requireUser();
  if (!auth.ok) return;
  await auth.supabase
    .from('room_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('member_id', auth.user.id);
  revalidatePath('/rooms');
}

/** One message that matched, with enough around it to be worth showing. */
export interface MessageHit {
  id: string;
  roomId: string;
  roomTitle: string;
  senderName: string;
  body: string;
  createdAt: string;
}

/**
 * Search the messages in rooms you belong to.
 *
 * Rooms accumulate what plans are actually made of — the address someone
 * pasted, what they said they'd bring, the time that got moved — and the only
 * way to find any of it again was to scroll. The longer a room had been useful,
 * the worse that got.
 *
 * Runs through the caller's own client, so `messages_select` scopes it exactly
 * as it scopes reading: a message the searcher could not open cannot be found
 * by searching for it. Reaching for the admin client here — the obvious way to
 * "make search fast" — would be a second answer to who may read a message, and
 * the second answer is the one that leaks.
 *
 * `websearch` rather than `plain`: it understands quoted phrases and `-word`,
 * and, unlike `to_tsquery`, it cannot be made to throw by ordinary punctuation.
 * Somebody searching for `what's the address?` should get results, not an error.
 */
export async function searchMessages(query: string): Promise<MessageHit[]> {
  const trimmed = query.trim();
  // Two characters is the shortest search worth running; below that every room
  // matches and the result is noise rather than an answer.
  if (trimmed.length < 2) return [];

  const auth = await requireUser();
  if (!auth.ok) return [];
  const { supabase } = auth;

  const { data } = await supabase
    .from('messages')
    .select('id, body, created_at, room_id, room:rooms(title), sender:profiles(display_name)')
    .textSearch('body', trimmed, { type: 'websearch', config: 'english' })
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map((row) => {
    const room = Array.isArray(row.room) ? row.room[0] : row.room;
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    return {
      id: row.id,
      roomId: row.room_id,
      roomTitle: room?.title ?? 'A room',
      senderName: sender?.display_name ?? 'Someone',
      body: row.body,
      createdAt: row.created_at,
    };
  });
}
