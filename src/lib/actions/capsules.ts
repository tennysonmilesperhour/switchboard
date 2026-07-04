'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function addCapsuleEntry(
  eventId: string,
  line: string,
  photoUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, error: 'Write one line first' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { error } = await supabase.from('capsule_entries').upsert(
    {
      event_id: eventId,
      user_id: user.id,
      line: trimmed.slice(0, 280),
      photo_url: photoUrl.trim() || null,
    },
    { onConflict: 'event_id,user_id' },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/events/${eventId}/capsule`);
  return { ok: true };
}
