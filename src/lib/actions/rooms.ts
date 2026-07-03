'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractItems } from '@/lib/ai/extract';

export async function sendMessage(
  roomId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Empty message' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { data: message, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, sender_id: user.id, body: trimmed })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

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

export async function toggleTask(
  itemId: string,
  roomId: string,
  done: boolean,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from('room_items').update({ done }).eq('id', itemId);
  revalidatePath(`/rooms/${roomId}`);
}

export async function addRoomNote(
  roomId: string,
  title: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !title.trim()) return { ok: false };
  await supabase.from('room_items').insert({
    room_id: roomId,
    kind: 'note',
    title: title.trim().slice(0, 120),
    created_by: user.id,
  });
  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
}
