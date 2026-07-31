'use server';

import type { ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { extractItems } from '@/lib/ai/extract';
import { isOwnPublicStorageUrl } from '@/lib/server/media';
import { notifyRoomActivity } from '@/lib/server/notify';

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
  if (!trimmed) return { ok: false, error: 'Empty message' };

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: message, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, sender_id: user.id, body: trimmed })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  notifyRoom(roomId, user.id).catch((notifyError) =>
    console.error('Room notification failed', notifyError),
  );

  // Quietly file useful information into the room. Best-effort.
  try {
    const items = await extractItems(trimmed);
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
    return { ok: false, error: 'Unsupported image.' };
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
  if (error) return { ok: false, error: error.message };

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

export async function toggleTask(
  itemId: string,
  roomId: string,
  done: boolean,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from('room_items').update({ done }).eq('id', itemId);
  revalidatePath(`/rooms/${roomId}`);
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
