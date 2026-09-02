'use server';

import { failure, type ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { requireUser } from '@/lib/server/require-user';
import { isValidCoordinate } from '@/lib/geo';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportAndFail } from '@/lib/server/observability';

export interface MomentActionResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  stage?: 'curious' | 'revealed' | 'accepted' | 'matched';
  roomId?: string;
}

export async function checkIn(
  placeName: string,
  experiences: string[],
  headline: string,
  hoursAvailable: number,
  zoneId: string | null = null,
  coords: { lat: number; lng: number } | null = null,
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

  // An optional coordinate (the user tapped "use my location") lets the check-in
  // land on the Map without a later geocode step. Only stored when it's a real
  // coordinate; a free-text place still works with no point at all.
  const point = coords && isValidCoordinate(coords.lat, coords.lng) ? coords : null;

  const { error } = await supabase.from('moments').insert({
    user_id: user.id,
    place_name: placeName.trim(),
    experiences,
    headline: headline.trim() || null,
    available_until: new Date(Date.now() + hoursAvailable * 3_600_000).toISOString(),
    zone_id: zoneId,
    latitude: point?.lat ?? null,
    longitude: point?.lng ?? null,
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
  const auth = await requireUser();
  if (!auth.ok) return null;
  const { supabase, user } = auth;
  const { data } = await supabase
    .from('moments')
    .select('id, user_id, place_name')
    .eq('id', momentId)
    .eq('user_id', user.id)
    .eq('status', 'open')
    .gt('available_until', new Date().toISOString())
    .maybeSingle();
  return data ? { ...data, supabase, user } : null;
}

type OwnedOpenMoment = NonNullable<Awaited<ReturnType<typeof ownOpenMoment>>>;

type CandidateAuthorization =
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      other: { user_id: string; place_name: string };
    }
  | { ok: false; result: MomentActionResult };

/**
 * Revalidate an anonymous candidate without ever returning its owner id to the
 * browser. The caller's session RPC proves the moment is still discoverable
 * (same place, live, unblocked); only then may the service role resolve the
 * owner needed for a notification, block, report, or matched room.
 */
async function authorizeMomentCandidate(
  mine: OwnedOpenMoment,
  otherMomentId: string,
): Promise<CandidateAuthorization> {
  const { data: visible, error: visibleError } = await mine.supabase.rpc(
    'find_shared_moments',
    { p_place: mine.place_name },
  );
  if (visibleError) {
    return {
      ok: false,
      result: await reportAndFail(
        'SB-MOMENT-SAVE',
        'moment.candidate',
        visibleError,
        { momentId: mine.id },
        'Could not verify this shared moment. Refresh and try again.',
      ),
    };
  }
  const isVisible = ((visible ?? []) as Array<{ id: string }>).some(
    (candidate) => candidate.id === otherMomentId,
  );
  if (!isVisible) {
    return { ok: false, result: failure('SB-MOMENT-ACCESS') };
  }

  const admin = createAdminClient();
  const { data: other, error: otherError } = await admin
    .from('moments')
    .select('user_id, place_name')
    .eq('id', otherMomentId)
    .eq('status', 'open')
    .gt('available_until', new Date().toISOString())
    .maybeSingle<{ user_id: string; place_name: string }>();
  if (otherError) {
    return {
      ok: false,
      result: await reportAndFail(
        'SB-MOMENT-SAVE',
        'moment.candidate',
        otherError,
        { momentId: mine.id },
        'Could not verify this shared moment. Refresh and try again.',
      ),
    };
  }
  if (!other || other.user_id === mine.user.id) {
    return { ok: false, result: failure('SB-MOMENT-ACCESS') };
  }

  // Explicit action-time recheck. The discovery RPC already filters blocks,
  // but repeating the predicate immediately before an admin write prevents a
  // stale page from using an old candidate after either person blocks.
  const { data: blocked, error: blockError } = await mine.supabase.rpc(
    'are_blocked',
    { p_user_a: mine.user.id, p_user_b: other.user_id },
  );
  if (blockError) {
    return {
      ok: false,
      result: await reportAndFail(
        'SB-MOMENT-SAVE',
        'moment.candidate',
        blockError,
        { momentId: mine.id },
        'Could not verify this shared moment. Refresh and try again.',
      ),
    };
  }
  if (blocked) {
    return { ok: false, result: failure('SB-MOMENT-ACCESS') };
  }

  return { ok: true, admin, other };
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

  const authorization = await authorizeMomentCandidate(mine, otherMomentId);
  if (!authorization.ok) return authorization.result;
  const { admin, other } = authorization;
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
    await notifyUsers([other.user_id], {
      kind: 'moment',
      title: '✨ The interest is mutual',
      body: 'Someone near you is curious too - take a look.',
      url: '/moments',
    });
    revalidatePath('/moments');
    return { ok: true, stage: 'revealed' };
  }

  // First one-sided curiosity: nudge the other person (no identity revealed)
  // so they can come reciprocate if they'd like.
  await notifyUsers([other.user_id], {
    kind: 'moment',
    title: '✨ Someone’s curious',
    body: 'A person near you would like to connect. Open Moments to see.',
    url: '/moments',
  });

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

  const authorization = await authorizeMomentCandidate(mine, otherMomentId);
  if (!authorization.ok) return authorization.result;
  const { admin, other } = authorization;

  // The browser cannot promote an anonymous candidate straight to `accepted`
  // to make the page load their identity. Acceptance is available only after
  // both curiosity rows reached `revealed` on the previous consent step.
  const { data: interest, error: interestError } = await admin
    .from('moment_interests')
    .select('id, stage')
    .eq('moment_id', myMomentId)
    .eq('other_moment_id', otherMomentId)
    .maybeSingle<{ id: string; stage: string }>();
  if (interestError) {
    return reportAndFail(
      'SB-MOMENT-SAVE',
      'moment.candidate',
      interestError,
      { momentId: mine.id },
      'Could not verify this shared moment. Refresh and try again.',
    );
  }
  if (!interest || (interest.stage !== 'revealed' && interest.stage !== 'accepted')) {
    return failure('SB-MOMENT-ACCESS');
  }
  if (interest.stage !== 'accepted') {
    await admin
      .from('moment_interests')
      .update({ stage: 'accepted' })
      .eq('id', interest.id)
      .eq('stage', 'revealed');
  }

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

/** Block an unrevealed candidate while keeping their profile id off the client. */
export async function blockMomentCandidate(
  myMomentId: string,
  otherMomentId: string,
): Promise<MomentActionResult> {
  const mine = await ownOpenMoment(myMomentId);
  if (!mine) return { ok: false, error: 'Your check-in has ended' };
  const authorization = await authorizeMomentCandidate(mine, otherMomentId);
  if (!authorization.ok) return authorization.result;

  const { error } = await mine.supabase.from('profile_blocks').insert({
    blocker_id: mine.user.id,
    blocked_id: authorization.other.user_id,
  });
  if (error && error.code !== '23505') {
    return reportAndFail(
      'SB-MOMENT-SAVE',
      'moment.block',
      error,
      { momentId: mine.id },
      'Could not block this person. Try again.',
    );
  }
  revalidatePath('/moments');
  return { ok: true };
}

/** Report an unrevealed candidate while keeping their profile id off the client. */
export async function reportMomentCandidate(
  myMomentId: string,
  otherMomentId: string,
  reason: string,
): Promise<MomentActionResult> {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) return { ok: false, error: 'Add a short reason.' };

  const mine = await ownOpenMoment(myMomentId);
  if (!mine) return { ok: false, error: 'Your check-in has ended' };
  const authorization = await authorizeMomentCandidate(mine, otherMomentId);
  if (!authorization.ok) return authorization.result;

  if (!(await checkRateLimit(`report:${mine.user.id}`, 10, 60 * 60))) {
    return failure('SB-RATE-LIMIT');
  }

  const { error } = await mine.supabase.from('user_reports').insert({
    reporter_id: mine.user.id,
    reported_id: authorization.other.user_id,
    reason: cleanReason,
  });
  if (error) {
    return reportAndFail(
      'SB-MOMENT-SAVE',
      'moment.report',
      error,
      { momentId: mine.id },
      'Could not send this report. Try again.',
    );
  }
  return { ok: true };
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
