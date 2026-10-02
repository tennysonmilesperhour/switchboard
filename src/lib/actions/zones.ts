'use server';

import type { ActionResult } from '@/lib/errors';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, requireUserOrRedirect } from '@/lib/server/require-user';
import { failure, validation } from '@/lib/errors';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { zoneJoinUrl } from '@/lib/links';
import { notifyUsers } from '@/lib/server/notify';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidCoordinate } from '@/lib/geo';
import { zoneSlugBase, zoneSlugCandidate } from '@/lib/zone-slug';
import { defaultZoneEnd, parseZoneEnd, ZONE_MAX_ASKS, ZONE_REASK_DAYS } from '@/lib/zone-rules';

/** Parse a hidden coordinate field the place picker fills in, or null. */
function coordField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function createZone(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUserOrRedirect();

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const experiences = formData.getAll('experiences').map(String).filter(Boolean);
  // Anything not explicitly private stays public, so the conference/festival
  // case that zones were built for is unchanged by this feature existing.
  const visibility =
    String(formData.get('visibility') ?? 'public') === 'private' ? 'private' : 'public';
  if (name.length < 3) redirect('/zones?error=name');
  const base = zoneSlugBase(name);

  // Optional coordinate captured when the organizer picks a map-recognized place,
  // so the zone is anchored on the Map from creation. Free text still works: an
  // unplaced zone can be pinned later from its own page.
  const lat = coordField(formData, 'latitude');
  const lng = coordField(formData, 'longitude');
  const located = lat !== null && lng !== null && isValidCoordinate(lat, lng);

  // Every zone ends (D23): the organizer's date, or a week from now. A date in
  // the past or absurdly far out is not silently accepted either way.
  const rawEnd = String(formData.get('ends_on') ?? '').trim();
  const endsAt = rawEnd ? parseZoneEnd(rawEnd) : defaultZoneEnd();
  if (!endsAt) redirect('/zones?error=end');

  // Two zones may share a name; only their addresses have to differ. A taken
  // slug is retried with a short suffix rather than refused.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = zoneSlugCandidate(base, attempt);
    const { error } = await supabase.from('zones').insert({
      slug,
      name: name.slice(0, 80),
      description: description || null,
      organizer_id: user.id,
      experiences,
      visibility,
      latitude: located ? lat : null,
      longitude: located ? lng : null,
      ends_at: endsAt,
    });
    if (!error) redirect(`/zones/${slug}`);
    if (error.code !== '23505') {
      // Was an unlogged "Could not create the zone" with no code: nothing to
      // join a screenshot to, and nothing in the logs to find.
      await reportOperationalError('zone.create', error, {}, 'SB-ZONE-SAVE');
      redirect('/zones?error=save');
    }
  }
  await reportOperationalError(
    'zone.create',
    new Error('No free slug after 4 attempts'),
    { base },
    'SB-ZONE-SAVE',
  );
  redirect('/zones?error=save');
}

/**
 * Flip a zone between public and private. Organizer/moderator only — enforced
 * by the zones UPDATE policy, not by this check, which only shapes the message.
 */
export async function setZoneVisibility(
  zoneId: string,
  visibility: 'public' | 'private',
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('zones')
    .update({ visibility })
    .eq('id', zoneId)
    .select('id');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.visibility', error);
  // RLS filtered the row out rather than erroring, which means the caller
  // doesn't run this zone.
  if (!data || data.length === 0) return failure('SB-ZONE-ACCESS');

  revalidatePath('/zones');
  return { ok: true };
}

/**
 * Pin a zone to a spot, move its pin, or clear it (`point` null). Organizer or
 * moderator only, enforced by the zones UPDATE policy; an RLS-filtered update
 * comes back empty and is reported as an access failure.
 */
export async function setZoneLocation(
  zoneId: string,
  point: { lat: number; lng: number } | null,
): Promise<ActionResult> {
  if (point && !isValidCoordinate(point.lat, point.lng)) {
    return validation('Pick a place from the suggestions to pin it.');
  }
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('zones')
    .update({ latitude: point?.lat ?? null, longitude: point?.lng ?? null })
    .eq('id', zoneId)
    .select('slug');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.location', error, { zoneId });
  if (!data || data.length === 0) return failure('SB-ZONE-ACCESS');

  revalidatePath(`/zones/${data[0].slug}`);
  revalidatePath('/zones');
  revalidatePath('/map');
  return { ok: true };
}

/** Mint (or return) the zone's shareable join link. Organizer/moderator only. */
export async function ensureZoneInviteLink(
  zoneId: string,
): Promise<ActionResult & { url?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: code, error } = await supabase.rpc('ensure_zone_invite_code', {
    p_zone: zoneId,
  });
  if (error) return reportAndFail('SB-ZONE-LINK', 'zone.invite-link', error);
  if (typeof code !== 'string') return failure('SB-ZONE-ACCESS');

  revalidatePath('/zones');
  return { ok: true, url: zoneJoinUrl(code) };
}

/** Rotate the code, invalidating every link already shared. */
export async function rotateZoneInviteLink(
  zoneId: string,
): Promise<ActionResult & { url?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: code, error } = await supabase.rpc('rotate_zone_invite_code', {
    p_zone: zoneId,
  });
  if (error) return reportAndFail('SB-ZONE-LINK', 'zone.invite-link-rotate', error);
  if (typeof code !== 'string') return failure('SB-ZONE-ACCESS');

  revalidatePath('/zones');
  return { ok: true, url: zoneJoinUrl(code) };
}

/**
 * Redeem a join code and return the zone's slug, or null for a code that
 * matches nothing. Used by the /zones/join/[code] landing page.
 */
export async function joinZoneViaCode(
  code: string,
): Promise<ActionResult & { slug?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: slug, error } = await supabase.rpc('join_zone_via_code', {
    p_code: code,
  });
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.join', error);
  if (typeof slug !== 'string') return failure('SB-ZONE-UNKNOWN');
  // No revalidatePath: this runs while /zones/join/[code] renders, where Next
  // refuses it and the person who just joined saw the crash screen. /zones is
  // rendered per request, so there is no cached list to refresh.
  return { ok: true, slug };
}

/** What asking actually did, so the door can say so (D10). */
export type ZoneRequestOutcome = 'pending' | 'member' | 'wait' | 'closed' | 'unavailable';

/**
 * Ask to be let into a private zone. The one thing a non-member may write, and
 * only through `request_zone_join`, which also decides whether an earlier
 * decision still stands: a denied or removed person may ask once more, 30 days
 * after it (D10).
 *
 * This used to insert a row directly and treat a unique violation as "already
 * asked", so someone denied last month was told "Asked" while the old denial
 * silently swallowed the new request and nobody was ever told.
 */
export async function requestToJoinZone(
  zoneId: string,
  note?: string,
): Promise<ActionResult & { outcome?: ZoneRequestOutcome; retryAfter?: string | null }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data, error } = await supabase.rpc('request_zone_join', {
    p_zone: zoneId,
    p_note: note?.trim() ? note.trim().slice(0, 280) : undefined,
  });
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.join-request', error);
  const row = Array.isArray(data) ? data[0] : null;
  const outcome = row?.outcome;

  if (outcome !== 'requested') {
    // Nothing new was filed, so nobody is told again. Each of these is a real
    // answer the requester needs, not an error.
    const known: ZoneRequestOutcome[] = ['pending', 'member', 'wait', 'closed', 'unavailable'];
    const answer = known.includes(outcome as ZoneRequestOutcome)
      ? (outcome as ZoneRequestOutcome)
      : 'unavailable';
    revalidatePath('/zones');
    return { ok: true, outcome: answer, retryAfter: row?.retry_after ?? null };
  }

  // Tell whoever can act on it. Organizers and moderators both can.
  //
  // The requester is by definition outside the zone, so their own client can
  // read neither a private zone's row nor its roster. The service role reads
  // them instead, authorized by the request this caller just filed through
  // `request_zone_join` (which binds it to auth.uid() and a private zone).
  // Nothing it reads reaches the requester.
  const admin = createAdminClient();
  const [{ data: zone }, { data: mods }] = await Promise.all([
    admin
      .from('zones')
      .select('name, slug, organizer_id, visibility')
      .eq('id', zoneId)
      .maybeSingle(),
    admin.from('zone_members').select('member_id').eq('zone_id', zoneId).eq('role', 'moderator'),
  ]);
  const recipients = new Set<string>();
  if (zone?.visibility === 'private' && zone.organizer_id) recipients.add(zone.organizer_id);
  for (const mod of zone?.visibility === 'private' ? (mods ?? []) : []) {
    recipients.add(mod.member_id);
  }
  recipients.delete(user.id);
  if (zone && recipients.size > 0) {
    await notifyUsers([...recipients], {
      kind: 'zone_join_request',
      title: `Someone asked to join ${zone.name}`,
      body: 'Open the zone to let them in or pass.',
      // The requests live on the zone's own page, not the zone list.
      url: `/zones/${zone.slug}`,
    });
  }

  revalidatePath('/zones');
  return { ok: true, outcome: 'pending', retryAfter: null };
}

/** Take back a request that is still waiting. A decision cannot be taken back. */
export async function withdrawZoneRequest(zoneId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('zone_join_requests')
    .delete()
    .eq('zone_id', zoneId)
    .eq('requester_id', user.id)
    .eq('status', 'pending');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.withdraw-request', error, { zoneId });
  revalidatePath('/zones');
  return { ok: true };
}

/**
 * Approve or deny a pending request. Organizer/moderator only. Either way the
 * requester hears the answer: a pass used to be silent, which left them looking
 * at "you've asked" forever (D10).
 */
export async function resolveZoneJoinRequest(
  requestId: string,
  approve: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  // Read the requester before resolving, so the answer can reach them.
  const { data: request } = await supabase
    .from('zone_join_requests')
    .select('requester_id, zone_id, asks')
    .eq('id', requestId)
    .maybeSingle();

  const { data: resolved, error } = await supabase.rpc('resolve_zone_join_request', {
    p_request: requestId,
    p_approve: approve,
  });
  if (error) {
    // The function raises for a caller who doesn't run the zone; that's an
    // authorization answer, not an outage.
    if (/not a moderator/i.test(error.message)) return failure('SB-ZONE-ACCESS');
    return reportAndFail('SB-ZONE-SAVE', 'zone.resolve-request', error);
  }

  // `false` means it was no longer pending: someone else already answered, or
  // the requester withdrew. Nobody should be told twice.
  if (resolved === true && request?.requester_id) {
    const { data: zone } = await supabase
      .from('zones')
      .select('name, slug')
      .eq('id', request.zone_id)
      .maybeSingle();
    const name = zone?.name ?? 'the zone';
    const url = zone?.slug ? `/zones/${zone.slug}` : '/zones';
    if (approve) {
      await notifyUsers([request.requester_id], {
        kind: 'zone_join_approved',
        title: `You’re in ${name}`,
        body: 'Check in whenever you get there.',
        url,
      });
    } else {
      const lastAsk = (request.asks ?? 1) >= ZONE_MAX_ASKS;
      await notifyUsers([request.requester_id], {
        kind: 'zone_join_denied',
        title: `${name} didn’t open up this time`,
        body: lastAsk
          ? 'The organizer passed on your request.'
          : `The organizer passed on your request. You can ask once more after ${ZONE_REASK_DAYS} days.`,
        url,
      });
    }
  }

  revalidatePath('/zones');
  return { ok: true };
}

/** Remove someone from a zone, or leave it yourself. */
export async function removeZoneMember(
  zoneId: string,
  memberId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('zone_members')
    .delete()
    .eq('zone_id', zoneId)
    .eq('member_id', memberId)
    .select('member_id');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.membership', error);
  // RLS filters a delete the caller may not make down to zero rows rather
  // than raising, which read as "removed" while they stayed in the zone.
  if (!data || data.length === 0) return failure('SB-ZONE-ACCESS');

  revalidatePath('/zones');
  return { ok: true };
}

/**
 * Leave a zone you are a member of. Always allowed (RLS lets anyone remove
 * themselves); the database also ends your open check-in there and clears your
 * old request, so asking back in later is not held against you. The organizer
 * is not on the roster and cannot leave their own zone — they delete it.
 */
export async function leaveZone(zoneId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from('zone_members')
    .delete()
    .eq('zone_id', zoneId)
    .eq('member_id', user.id)
    .select('member_id');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.membership', error, { zoneId });
  if (!data || data.length === 0) {
    return validation('You’re not on this zone’s list, so there is nothing to leave.');
  }

  revalidatePath('/zones', 'layout');
  revalidatePath('/moments');
  return { ok: true };
}

export interface ZoneDetailsInput {
  name: string;
  description: string;
  experiences: string[];
  /** `YYYY-MM-DD` or an ISO timestamp; see `parseZoneEnd`. */
  endsOn: string;
}

/**
 * Rename a zone, edit its description and experiences, or move its end date.
 * Organizer or moderator, enforced by the zones UPDATE policy; an RLS-filtered
 * update comes back empty and is reported as an access failure. The address
 * (slug) stays put, so links already shared keep working.
 */
export async function updateZoneDetails(
  zoneId: string,
  input: ZoneDetailsInput,
): Promise<ActionResult> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 3) return validation('Zones need a name of at least 3 letters.');
  const endsAt = parseZoneEnd(input.endsOn);
  if (!endsAt) return validation('Pick an end date between today and a year from now.');
  const experiences = [
    ...new Set(
      input.experiences
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 12);

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('zones')
    .update({
      name,
      description: input.description.trim().slice(0, 280) || null,
      experiences,
      ends_at: endsAt,
    })
    .eq('id', zoneId)
    .select('slug');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.update', error, { zoneId });
  if (!data || data.length === 0) return failure('SB-ZONE-ACCESS');

  revalidatePath(`/zones/${data[0].slug}`);
  revalidatePath('/zones');
  revalidatePath('/map');
  return { ok: true };
}

/**
 * Delete a zone. The organizer only (the zones DELETE policy). Open check-ins
 * in it are ended by the database rather than turned loose as zone-less ones.
 */
export async function deleteZone(zoneId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('zones')
    .delete()
    .eq('id', zoneId)
    .select('id');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.delete', error, { zoneId });
  if (!data || data.length === 0) {
    return failure('SB-ZONE-ACCESS', 'Only the person who made this zone can delete it.');
  }

  revalidatePath('/zones', 'layout');
  revalidatePath('/map');
  revalidatePath('/moments');
  return { ok: true };
}

/**
 * Make a member a moderator, or step a moderator back to member. Organizer or
 * moderator only, through the zone_members UPDATE policy; the roster identity
 * is frozen by trigger, so this can only ever change a role.
 */
export async function setZoneMemberRole(
  zoneId: string,
  memberId: string,
  role: 'member' | 'moderator',
): Promise<ActionResult> {
  if (role !== 'member' && role !== 'moderator') return validation('Pick a role.');
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('zone_members')
    .update({ role })
    .eq('zone_id', zoneId)
    .eq('member_id', memberId)
    .select('member_id');
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.role', error, { zoneId });
  if (!data || data.length === 0) return failure('SB-ZONE-ACCESS');

  revalidatePath('/zones', 'layout');
  return { ok: true };
}
