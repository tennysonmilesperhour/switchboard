'use server';

import { failure, validation, type ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { requireUser } from '@/lib/server/require-user';
import { isValidCoordinate } from '@/lib/geo';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportAndFail } from '@/lib/server/observability';
import { removeBlockedFromMyGroups } from '@/lib/server/block-cascade';

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

/** The longest a check-in stays live: the top of the check-in screen's slider. */
const MAX_MOMENT_HOURS = 8;

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
  if (!placeName.trim()) return validation('Where are you?');
  if (experiences.length === 0) return validation('Pick at least one experience');
  // The check-in screen offers 1-8 hours, but this is a server action: nothing
  // stopped a direct call from keeping a check-in "live" for a year, a stranger's
  // anonymous presence in everyone else's Moments long after they had left.
  // Bounded here, as are the free-text fields.
  const hours = Number.isFinite(hoursAvailable)
    ? Math.min(Math.max(Math.round(hoursAvailable), 1), MAX_MOMENT_HOURS)
    : 2;
  const cleanExperiences = experiences
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().slice(0, 40))
    .slice(0, 8);
  if (cleanExperiences.length === 0) return validation('Pick at least one experience');

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
    place_name: placeName.trim().slice(0, 120),
    experiences: cleanExperiences,
    headline: headline.trim().slice(0, 140) || null,
    available_until: new Date(Date.now() + hours * 3_600_000).toISOString(),
    zone_id: zoneId,
    latitude: point?.lat ?? null,
    longitude: point?.lng ?? null,
  });
  if (error) {
    // The check-in gate's refusals are answers, not outages
    // (enforce_zone_checkin_access).
    if (/zone has ended/i.test(error.message)) {
      return validation('This zone has ended, so it isn’t taking check-ins any more.');
    }
    if (/not part of/i.test(error.message)) {
      return failure('SB-MOMENT-ACCESS', 'You’re no longer in this zone, so you can’t check in here.');
    }
    return reportAndFail('SB-MOMENT-SAVE', 'moment.create', error);
  }
  revalidatePath('/moments');
  return { ok: true };
}

/**
 * Check out. A matched moment closes too: the page shows a matched check-in
 * until `available_until`, so closing only `open` rows left someone who had
 * matched with no way back to the check-in form for hours. The conversation
 * lives in its own room, and the other person's moment row is theirs, so
 * closing this one takes nothing away from either side's chat.
 */
export async function closeMoment(): Promise<MomentActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { error } = await supabase
    .from('moments')
    .update({ status: 'closed' })
    .eq('user_id', user.id)
    .in('status', ['open', 'matched']);
  if (error) return reportAndFail('SB-MOMENT-SAVE', 'moment.update', error);
  revalidatePath('/moments');
  return { ok: true };
}

async function ownOpenMoment(momentId: string) {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { data, error } = await supabase
    .from('moments')
    .select('id, user_id, place_name')
    .eq('id', momentId)
    .eq('user_id', user.id)
    .eq('status', 'open')
    .gt('available_until', new Date().toISOString())
    .maybeSingle();
  if (error) {
    return reportAndFail('SB-MOMENT-SAVE', 'moment.load', error, { momentId });
  }
  if (!data) return validation('Your check-in has ended');
  return { ok: true as const, ...data, supabase, user };
}

type OwnedOpenMoment = Extract<
  Awaited<ReturnType<typeof ownOpenMoment>>,
  { ok: true }
>;

type CandidateAuthorization =
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      other: { user_id: string; place_name: string };
    }
  | { ok: false; result: MomentActionResult };

function rejectCandidate(result: MomentActionResult): CandidateAuthorization {
  const rejection = { ok: false as const, result };
  return rejection;
}

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
    return rejectCandidate(
      await reportAndFail(
        'SB-MOMENT-SAVE',
        'moment.candidate',
        visibleError,
        { momentId: mine.id },
        'Could not verify this shared moment. Refresh and try again.',
      ),
    );
  }
  const isVisible = ((visible ?? []) as Array<{ id: string }>).some(
    (candidate) => candidate.id === otherMomentId,
  );
  if (!isVisible) {
    return rejectCandidate(failure('SB-MOMENT-ACCESS'));
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
    return rejectCandidate(
      await reportAndFail(
        'SB-MOMENT-SAVE',
        'moment.candidate',
        otherError,
        { momentId: mine.id },
        'Could not verify this shared moment. Refresh and try again.',
      ),
    );
  }
  if (!other || other.user_id === mine.user.id) {
    return rejectCandidate(failure('SB-MOMENT-ACCESS'));
  }

  // Explicit action-time recheck. The discovery RPC already filters blocks,
  // but repeating the predicate immediately before an admin write prevents a
  // stale page from using an old candidate after either person blocks.
  // `are_blocked(a, b)` is service-role only since the pair oracles were
  // revoked from browser roles; a signed-in caller asks about itself through
  // `is_blocked_with`, which binds the first side to auth.uid().
  const { data: blocked, error: blockError } = await mine.supabase.rpc(
    'is_blocked_with',
    { p_other: other.user_id },
  );
  if (blockError) {
    return rejectCandidate(
      await reportAndFail(
        'SB-MOMENT-SAVE',
        'moment.candidate',
        blockError,
        { momentId: mine.id },
        'Could not verify this shared moment. Refresh and try again.',
      ),
    );
  }
  if (blocked) {
    return rejectCandidate(failure('SB-MOMENT-ACCESS'));
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
  if (!mine.ok) return mine;

  const authorization = await authorizeMomentCandidate(mine, otherMomentId);
  if (!authorization.ok) return authorization.result;
  const { admin, other } = authorization;
  // Only a row this call actually created counts as news. A second tap on the
  // same person used to notify them again every time, while the write itself
  // was (correctly) ignored as a duplicate.
  const { data: created } = await admin
    .from('moment_interests')
    .upsert(
      { moment_id: myMomentId, other_moment_id: otherMomentId, stage: 'curious' },
      { onConflict: 'moment_id,other_moment_id', ignoreDuplicates: true },
    )
    .select('id');
  const firstTime = (created?.length ?? 0) > 0;

  const { data: reverse } = await admin
    .from('moment_interests')
    .select('id, stage')
    .eq('moment_id', otherMomentId)
    .eq('other_moment_id', myMomentId)
    .maybeSingle();

  if (reverse && reverse.stage !== 'passed') {
    // Already mutual on an earlier tap: nothing new to say.
    const alreadyRevealed = reverse.stage === 'revealed' || reverse.stage === 'accepted';
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
    if (!alreadyRevealed) {
      await notifyUsers([other.user_id], {
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
  // so they can come reciprocate if they'd like. Once — and never to someone
  // who already passed on this moment: their Moments page hides a passed
  // candidate, so "Open Moments to see" would lead them to nothing, and "Not
  // today" should mean not being asked again today.
  if (firstTime && reverse?.stage !== 'passed') {
    await notifyUsers([other.user_id], {
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
  if (!mine.ok) return mine;

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

  // Both said yes. If both tapped at the same moment, both calls get here, and
  // each used to open its own room and send its own match notifications. The
  // pair of moments is claimed first, open → matched in one guarded write; only
  // the call that flips both opens the room.
  const { data: claimed } = await admin
    .from('moments')
    .update({ status: 'matched' })
    .in('id', [myMomentId, otherMomentId])
    .eq('status', 'open')
    .select('id');
  const claimedCount = claimed?.length ?? 0;
  if (claimedCount === 1) {
    // One side was no longer open: that check-in ended between the two taps.
    // Give back the half we took rather than strand this side as matched with
    // no room, and say what happened.
    await admin
      .from('moments')
      .update({ status: 'open' })
      .in('id', (claimed ?? []).map((row) => row.id));
    revalidatePath('/moments');
    return failure('SB-MOMENT-ACCESS');
  }
  if (claimedCount === 0) {
    // The other accept got here first and is opening the room.
    revalidatePath('/moments');
    return { ok: true, stage: 'matched' };
  }

  const { data: room, error: roomError } = await admin
    .from('rooms')
    .insert({
      kind: 'moment',
      title: `✨ ${mine.place_name}`,
      created_by: mine.user_id,
    })
    .select('id')
    .single();
  if (roomError || !room) {
    // Give the claim back so another accept can try again.
    await admin
      .from('moments')
      .update({ status: 'open' })
      .in('id', [myMomentId, otherMomentId]);
    return reportAndFail(
      'SB-MOMENT-CHAT',
      'moment.chat',
      roomError ?? new Error('insert returned no room'),
      { myMomentId, otherMomentId },
    );
  }

  const { error: membersError } = await admin.from('room_members').insert([
    { room_id: room.id, member_id: mine.user_id },
    { room_id: room.id, member_id: other.user_id },
  ]);
  if (membersError) {
    // A match whose room nobody is in is worse than no match: take the room
    // back and give the claim back so either person can try again.
    await admin.from('rooms').delete().eq('id', room.id);
    await admin
      .from('moments')
      .update({ status: 'open' })
      .in('id', [myMomentId, otherMomentId]);
    return reportAndFail('SB-MOMENT-CHAT', 'moment.chat', membersError, {
      myMomentId,
      otherMomentId,
    });
  }

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
  if (!mine.ok) return mine;
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
  // The same block as everywhere else: a candidate who is already a connection
  // leaves the connection and the circles too.
  const unlinked = await removeBlockedFromMyGroups(
    mine.supabase,
    mine.user.id,
    authorization.other.user_id,
  );
  if (unlinked) return unlinked;
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
  if (!cleanReason) return validation('Add a short reason.');

  const mine = await ownOpenMoment(myMomentId);
  if (!mine.ok) return mine;
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
): Promise<MomentActionResult> {
  const mine = await ownOpenMoment(myMomentId);
  if (!mine.ok) return mine;
  // The service-role write below names a client-supplied candidate, so it gets
  // the same proof as every other candidate action: still discoverable from
  // this caller's own moment, and not blocked either way.
  const authorization = await authorizeMomentCandidate(mine, otherMomentId);
  if (!authorization.ok) return authorization.result;
  const { error } = await authorization.admin
    .from('moment_interests')
    .upsert(
      { moment_id: myMomentId, other_moment_id: otherMomentId, stage: 'passed' },
      { onConflict: 'moment_id,other_moment_id' },
    );
  if (error) {
    return reportAndFail('SB-MOMENT-SAVE', 'moment.update', error, { momentId: mine.id });
  }
  revalidatePath('/moments');
  return { ok: true };
}
