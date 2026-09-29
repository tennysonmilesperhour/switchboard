'use server';

import { failure, validation, type ActionResult, type ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import type { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { extractItems, extractWithRules } from '@/lib/ai/extract';
import { isOwnPublicStorageUrl, PRIVATE_MEDIA_BUCKET } from '@/lib/server/media';
import { isOwnRoomPhotoPath, signRoomPhotos } from '@/lib/server/room-media';
import { notifyRoomActivity } from '@/lib/server/notify';
import { reportAndFail } from '@/lib/server/observability';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { ROOM_PAGE_SIZE, type RoomMessage } from '@/app/rooms/[id]/room-messages';

/** Mirrors the CHECK on `messages.body`. */
const MAX_MESSAGE_LENGTH = 4000;

/**
 * What the sender is told when a block has closed the room (D12). It says what
 * is true for both people — nothing more — so it never tells the person who was
 * blocked who did it; the room itself shows the same sentence.
 */
const READ_ONLY_MESSAGE =
  'This conversation is read-only now, so nothing new can be added. You can still read what was said.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A write refused inside a room is either the block rule (not a failure — the
 * room is closed, and "reload and try again" would never work) or a real
 * operational error that carries its code.
 */
async function refusedWrite(
  supabase: ServerClient,
  roomId: string,
  code: ErrorCode,
  area: 'room.message' | 'room.image' | 'room.task',
  error: unknown,
  context: Record<string, unknown>,
): Promise<ActionResult> {
  const { data: readOnly } = await supabase.rpc('room_is_read_only', { p_room: roomId });
  if (readOnly === true) return validation(READ_ONLY_MESSAGE);
  return reportAndFail(code, area, error, context);
}

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
  if (error) {
    return refusedWrite(supabase, roomId, 'SB-ROOM-SAVE', 'room.message', error, { roomId });
  }

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

/**
 * Send a photo someone just uploaded.
 *
 * New photos are uploaded to the private `media-private` bucket and arrive here
 * as a storage path, which must sit in the sender's own folder: that bucket also
 * holds voice notes and capsule photos, and a room page signs whatever path a
 * message carries (docs/SECURITY.md, "Media privacy"). The database enforces the
 * same rule (20260930021000_private_room_photos.sql). A public URL into our own
 * `media` bucket is still accepted so a tab opened before this change can finish
 * sending; it was already public.
 */
export async function sendPhotoMessage(
  roomId: string,
  imageRef: string,
  caption?: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const ref = imageRef.trim();
  if (!isOwnRoomPhotoPath(ref, user.id) && !isOwnPublicStorageUrl(ref, ['media'])) {
    return validation('Unsupported image.');
  }
  const title = caption?.trim().slice(0, 120) || 'Photo';

  // Insert through the member's own client so message RLS proves room
  // membership (and that no block has closed the room) before anything is
  // written.
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_id: user.id,
      body: caption?.trim().slice(0, 4000) || '📷 Photo',
      image_url: ref,
    })
    .select('id')
    .single();
  if (error) {
    return refusedWrite(supabase, roomId, 'SB-ROOM-SAVE', 'room.image', error, { roomId });
  }

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
      url: ref,
      created_by: user.id,
    });
  } catch {
    // The gallery is a bonus, never a blocker.
  }

  return { ok: true };
}

/**
 * Signed URLs for photos that reached the room over realtime.
 *
 * A realtime payload carries the stored path, which a browser cannot load. The
 * rows are re-read through the caller's own client, so `messages_select` decides
 * whether they may see these photos at all; only what that read returns is
 * signed, and only inside each sender's own folder.
 */
export async function signRoomMessagePhotos(
  roomId: string,
  messageIds: string[],
): Promise<Record<string, string | null>> {
  const ids = messageIds.filter((id) => UUID_RE.test(id)).slice(0, 50);
  if (ids.length === 0) return {};
  const auth = await requireUser();
  if (!auth.ok) return {};

  const { data } = await auth.supabase
    .from('messages')
    .select('id, sender_id, image_url')
    .eq('room_id', roomId)
    .in('id', ids);
  const signed = await signRoomPhotos(
    (data ?? []).map((row) => ({ key: row.id, ref: row.image_url, ownerId: row.sender_id })),
  );
  return Object.fromEntries(signed);
}

export interface EarlierMessages {
  ok: boolean;
  messages: RoomMessage[];
  /** True when there is at least one more page before these. */
  hasMore: boolean;
  error?: string;
  code?: ErrorCode;
  fix?: string | null;
}

/**
 * The page of messages before `before` (an ISO timestamp), for "Load earlier".
 * The room opens on its newest 200; this is how the rest of the conversation is
 * reached. Read through the caller's client, so RLS scopes it exactly as the
 * room page is scoped.
 */
export async function loadEarlierMessages(
  roomId: string,
  before: string,
): Promise<EarlierMessages> {
  const auth = await requireUser();
  if (!auth.ok) return { ...auth, messages: [], hasMore: false };
  if (!UUID_RE.test(roomId) || Number.isNaN(Date.parse(before))) {
    return { ...validation('That room link is not valid.'), messages: [], hasMore: false };
  }

  const { data, error } = await auth.supabase
    .from('messages')
    .select('id, sender_id, body, image_url, created_at')
    .eq('room_id', roomId)
    .lt('created_at', before)
    .order('created_at', { ascending: false })
    .limit(ROOM_PAGE_SIZE + 1);
  if (error) {
    const failed = await reportAndFail('SB-ROOM-LOAD', 'room.history', error, { roomId });
    return { ...failed, messages: [], hasMore: false };
  }

  const rows = data ?? [];
  const page = rows.slice(0, ROOM_PAGE_SIZE);
  const signed = await signRoomPhotos(
    page.map((row) => ({ key: row.id, ref: row.image_url, ownerId: row.sender_id })),
  );
  return {
    ok: true,
    hasMore: rows.length > ROOM_PAGE_SIZE,
    messages: page
      .map((row) => ({ ...row, image_src: signed.get(row.id) ?? null }))
      .reverse(),
  };
}

/**
 * Delete one of your own messages. `messages_delete` (20260710124000) already
 * lets a sender remove their own rows; this is the button for it. A photo's
 * filed Photos-tab entry goes with it, and so does the stored object when it is
 * one of the sender's private uploads — deleting a photo should delete the
 * photo, not just the line that pointed at it.
 */
export async function deleteMessage(
  messageId: string,
  roomId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(messageId)) return validation('That message is no longer here.');

  const { data, error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('room_id', roomId)
    .eq('sender_id', user.id)
    .select('id, image_url');
  if (error) {
    return reportAndFail('SB-ROOM-SAVE', 'room.message-delete', error, { roomId, messageId });
  }
  // RLS lets only the sender delete; a refused delete is zero rows, not an error.
  const deleted = data?.[0];
  if (!deleted) return validation('That message was already deleted, or isn’t yours to delete.');

  const imageRef = deleted.image_url;
  if (imageRef) {
    // Best-effort: the message is gone either way.
    await supabase
      .from('room_items')
      .delete()
      .eq('room_id', roomId)
      .eq('kind', 'photo')
      .eq('url', imageRef);
    if (isOwnRoomPhotoPath(imageRef, user.id) && hasAdminCredentials()) {
      const admin = createAdminClient();
      // A photo someone reported stays in storage: the report holds its path so
      // a moderator can still see what was sent (docs/SECURITY.md,
      // "Moderation"). The caller has just proved, through their own RLS
      // delete, that this path was theirs; the count tells them nothing.
      const { count, error: reportedError } = await admin
        .from('user_reports')
        .select('id', { count: 'exact', head: true })
        .eq('reported_id', user.id)
        .eq('snapshot_image', imageRef);
      if (!reportedError && !count) {
        await admin.storage.from(PRIVATE_MEDIA_BUCKET).remove([imageRef]).catch(() => undefined);
      }
    }
  }

  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
}

/**
 * Report one message in a room.
 *
 * The report attaches the message itself: the database copies its words and
 * photo from the row (never from here), so a moderator sees what was said even
 * if the sender deletes it afterwards, and `reported_id` is always its real
 * sender (20260930070000_moderator_actions.sql). The message is read through
 * the reporter's own client first, so only a member of the room can report
 * it, and a stranger probing ids learns nothing.
 */
export async function reportRoomMessage(
  messageId: string,
  reason: string,
): Promise<ActionResult> {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) return validation('Add a short reason.');
  if (!UUID_RE.test(messageId)) return failure('SB-MESSAGE-MISSING');

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: message } = await supabase
    .from('messages')
    .select('id, sender_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!message) return failure('SB-MESSAGE-MISSING');
  if (message.sender_id === user.id) return validation('That’s your own message.');

  // The budget every report shares: enough for a bad afternoon, not enough to
  // flood the queue or mass-target one person.
  if (!(await checkRateLimit(`report:${user.id}`, 10, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’ve filed several reports. Try again later.');
  }

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: user.id,
    reported_id: message.sender_id,
    target_kind: 'room_message',
    message_id: message.id,
    reason: cleanReason,
  });
  // Filing twice is the same report, not a failure the reporter needs to see.
  if (!error || error.code === '23505') return { ok: true };
  // Deleted or removed between the read above and the insert.
  if (error.code === 'P0002') return failure('SB-MESSAGE-MISSING');
  return reportAndFail('SB-MESSAGE-REPORT', 'room.report-message', error, { messageId });
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
  if (error) {
    return refusedWrite(auth.supabase, roomId, 'SB-ROOM-SAVE', 'room.task', error, {
      roomId,
      itemId,
    });
  }
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

/**
 * Mute or unmute a room for yourself (D20: a muted room sends you no
 * notifications). Your own membership row only; the database freezes which room
 * and which person that row is about.
 */
export async function setRoomMuted(roomId: string, muted: boolean): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase
    .from('room_members')
    .update({ muted })
    .eq('room_id', roomId)
    .eq('member_id', auth.user.id)
    .select('room_id');
  if (error) return reportAndFail('SB-ROOM-SAVE', 'room.mute', error, { roomId });
  if (!data || data.length === 0) return validation('You’re no longer in this room.');
  revalidatePath(`/rooms/${roomId}`);
  revalidatePath('/rooms');
  return { ok: true };
}

/**
 * Leave a room (D20): a match room at any time, a plan's room once the plan is
 * over. The rule lives in `leave_room`; this turns its answer into a sentence.
 */
export async function leaveRoom(roomId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.rpc('leave_room', { p_room: roomId });
  if (error) return reportAndFail('SB-ROOM-SAVE', 'room.leave', error, { roomId });
  switch (data) {
    case 'left':
    case 'not_member':
      revalidatePath('/rooms');
      return { ok: true };
    case 'plan_not_over':
      return validation(
        'You can leave a plan’s room once the plan is over. Until then, mute it to stop the notifications.',
      );
    default:
      return validation('This kind of room can’t be left. Mute it to stop the notifications.');
  }
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
