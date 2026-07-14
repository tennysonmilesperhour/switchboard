'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { requireUser } from '@/lib/server/require-user';

export interface MomentActionResult {
  ok: boolean;
  error?: string;
  stage?: 'curious' | 'revealed' | 'accepted' | 'matched';
  roomId?: string;
}

export async function checkIn(
  placeName: string,
  experiences: string[],
  headline: string,
  hoursAvailable: number,
  zoneId: string | null = null,
): Promise<MomentActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!placeName.trim()) return { ok: false, error: 'Where are you?' };
  if (experiences.length === 0) return { ok: false, error: 'Pick at least one experience' };

  // One open moment at a time.
  await supabase
    .from('moments')
    .update({ status: 'closed' })
    .eq('user_id', user.id)
    .eq('status', 'open');

  const { error } = await supabase.from('moments').insert({
    user_id: user.id,
    place_name: placeName.trim(),
    experiences,
    headline: headline.trim() || null,
    available_until: new Date(Date.now() + hoursAvailable * 3_600_000).toISOString(),
    zone_id: zoneId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/moments');
  return { ok: true };
}

export async function closeMoment(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('moments')
    .update({ status: 'closed' })
    .eq('user_id', user.id)
    .eq('status', 'open');
  revalidatePath('/moments');
}

async function ownOpenMoment(momentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('moments')
    .select('id, user_id, place_name')
    .eq('id', momentId)
    .eq('user_id', user.id)
    .eq('status', 'open')
    .maybeSingle();
  return data;
}

/**
 * Consent step 2: "I'd like to learn more."
 * Reveals introductions only when curiosity is mutual.
 */
export async function expressCuriosity(
  myMomentId: string,
  otherMomentId: string,
): Promise<MomentActionResult> {
  const mine = await ownOpenMoment(myMomentId);
  if (!mine) return { ok: false, error: 'Your check-in has ended' };

  const admin = createAdminClient();
  await admin
    .from('moment_interests')
    .upsert(
      { moment_id: myMomentId, other_moment_id: otherMomentId, stage: 'curious' },
      { onConflict: 'moment_id,other_moment_id', ignoreDuplicates: true },
    );

  const { data: reverse } = await admin
    .from('moment_interests')
    .select('id, stage')
    .eq('moment_id', otherMomentId)
    .eq('other_moment_id', myMomentId)
    .maybeSingle();

  // Who owns the other moment — used to nudge them so the consent loop can
  // advance without both people having to sit and refresh /moments.
  const { data: otherMoment } = await admin
    .from('moments')
    .select('user_id')
    .eq('id', otherMomentId)
    .maybeSingle<{ user_id: string }>();

  if (reverse && reverse.stage !== 'passed') {
    // Mutual curiosity → both sides may now see a gentle introduction.
    await admin
      .from('moment_interests')
      .update({ stage: 'revealed' })
      .in('id', [reverse.id])
      .neq('stage', 'accepted');
    await admin
      .from('moment_interests')
      .update({ stage: 'revealed' })
      .eq('moment_id', myMomentId)
      .eq('other_moment_id', otherMomentId)
      .neq('stage', 'accepted');
    if (otherMoment) {
      await notifyUsers([otherMoment.user_id], {
        kind: 'moment',
        title: '✨ The interest is mutual',
        body: 'Someone near you is curious too - take a look.',
        url: '/moments',
      });
    }
    revalidatePath('/moments');
    return { ok: true, stage: 'revealed' };
  }

  // First one-sided curiosity: nudge the other person (no identity revealed)
  // so they can come reciprocate if they'd like.
  if (otherMoment) {
    await notifyUsers([otherMoment.user_id], {
      kind: 'moment',
      title: '✨ Someone’s curious',
      body: 'A person near you would like to connect. Open Moments to see.',
      url: '/moments',
    });
  }

  revalidatePath('/moments');
  return { ok: true, stage: 'curious' };
}

/** Consent step 3: "I'd love to share this moment." */
export async function acceptMoment(
  myMomentId: string,
  otherMomentId: string,
): Promise<MomentActionResult> {
  const mine = await ownOpenMoment(myMomentId);
  if (!mine) return { ok: false, error: 'Your check-in has ended' };

  const admin = createAdminClient();
  await admin
    .from('moment_interests')
    .update({ stage: 'accepted' })
    .eq('moment_id', myMomentId)
    .eq('other_moment_id', otherMomentId);

  const { data: reverse } = await admin
    .from('moment_interests')
    .select('stage')
    .eq('moment_id', otherMomentId)
    .eq('other_moment_id', myMomentId)
    .maybeSingle();

  if (reverse?.stage !== 'accepted') {
    revalidatePath('/moments');
    return { ok: true, stage: 'accepted' };
  }

  // Both said yes → open a room, connect the two people.
  const { data: other } = await admin
    .from('moments')
    .select('user_id, place_name')
    .eq('id', otherMomentId)
    .single();
  if (!other) return { ok: false, error: 'Moment expired' };

  const { data: room } = await admin
    .from('rooms')
    .insert({
      kind: 'moment',
      title: `✨ ${mine.place_name}`,
      created_by: mine.user_id,
    })
    .select('id')
    .single();
  if (!room) return { ok: false, error: 'Could not open a chat' };

  await admin.from('room_members').insert([
    { room_id: room.id, member_id: mine.user_id },
    { room_id: room.id, member_id: other.user_id },
  ]);
  await admin
    .from('moments')
    .update({ status: 'matched' })
    .in('id', [myMomentId, otherMomentId]);

  // Durable notification (in-app row + push), so a match is discoverable later
  // in /notifications even if the recipient never enabled push or is offline.
  await notifyUsers([mine.user_id, other.user_id], {
    kind: 'match',
    title: '✨ You’d both love to share this moment',
    body: 'A conversation is open - say hi and pick a spot.',
    url: `/rooms/${room.id}`,
  });

  revalidatePath('/moments');
  return { ok: true, stage: 'matched', roomId: room.id };
}

export async function passMoment(
  myMomentId: string,
  otherMomentId: string,
): Promise<void> {
  const mine = await ownOpenMoment(myMomentId);
  if (!mine) return;
  const admin = createAdminClient();
  await admin
    .from('moment_interests')
    .upsert(
      { moment_id: myMomentId, other_moment_id: otherMomentId, stage: 'passed' },
      { onConflict: 'moment_id,other_moment_id' },
    );
  revalidatePath('/moments');
}
