'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStoredMediaPath, isOwnPublicStorageUrl } from '@/lib/server/media';

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

  // Only accept a photo that lives in our own storage — a private-bucket path
  // (new uploads) or a legacy public media URL — never an arbitrary
  // attacker-supplied URL (SB-28).
  const photo = photoUrl.trim() || null;
  if (photo && !isStoredMediaPath(photo) && !isOwnPublicStorageUrl(photo, ['media'])) {
    return { ok: false, error: 'Unexpected image location — please re-upload.' };
  }

  const { error } = await supabase.from('capsule_entries').upsert(
    {
      event_id: eventId,
      user_id: user.id,
      line: trimmed.slice(0, 280),
      photo_url: photo,
    },
    { onConflict: 'event_id,user_id' },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/events/${eventId}/capsule`);
  return { ok: true };
}
