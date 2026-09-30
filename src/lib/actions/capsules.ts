'use server';

import { validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { isStoredMediaPath, isOwnPublicStorageUrl } from '@/lib/server/media';
import { reportAndFail } from '@/lib/server/observability';

const CAPSULE_WRITERS =
  'Only people who went, and the plan’s hosts, can add to the capsule.';

export async function addCapsuleEntry(
  eventId: string,
  line: string,
  photoUrl: string,
): Promise<ActionResult> {
  const trimmed = line.trim();
  if (!trimmed) return validation('Write one line first');

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Only accept a photo that lives in our own storage — a private-bucket path
  // (new uploads) or a legacy public media URL — never an arbitrary
  // attacker-supplied URL (SB-28).
  const photo = photoUrl.trim() || null;
  if (photo && !isStoredMediaPath(photo) && !isOwnPublicStorageUrl(photo, ['media'])) {
    return validation('Unexpected image location - please re-upload.');
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
  if (error) {
    // The capsule policies take lines only from people who went and the
    // plan's hosts (G28). A refusal from them is that rule, not an incident.
    if (error.code === '42501') return validation(CAPSULE_WRITERS);
    return reportAndFail('SB-CAPSULE-SAVE', 'capsule.save', error, { eventId });
  }
  revalidatePath(`/events/${eventId}/capsule`);
  return { ok: true };
}
