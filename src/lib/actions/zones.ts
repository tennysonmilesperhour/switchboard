'use server';

import type { ActionResult } from '@/lib/errors';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { failure } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';
import { zoneJoinUrl } from '@/lib/links';
import { notifyUsers } from '@/lib/server/notify';
import { isValidCoordinate } from '@/lib/geo';

/** Parse a hidden coordinate field the place picker fills in, or null. */
function coordField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function createZone(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const experiences = formData.getAll('experiences').map(String).filter(Boolean);
  // Anything not explicitly private stays public, so the conference/festival
  // case that zones were built for is unchanged by this feature existing.
  const visibility =
    String(formData.get('visibility') ?? 'public') === 'private' ? 'private' : 'public';
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);

  if (!name || slug.length < 3) redirect('/zones?error=name');

  // Optional coordinate captured when the organizer picks a map-recognized place,
  // so the zone is anchored on the Map from creation. Free text still works: an
  // unplaced zone can be located later from the map's "Locate my plans" control.
  const lat = coordField(formData, 'latitude');
  const lng = coordField(formData, 'longitude');
  const located = lat !== null && lng !== null && isValidCoordinate(lat, lng);

  const { error } = await supabase.from('zones').insert({
    slug,
    name,
    description: description || null,
    organizer_id: user.id,
    experiences,
    visibility,
    latitude: located ? lat : null,
    longitude: located ? lng : null,
  });
  if (error) {
    redirect(`/zones?error=${error.code === '23505' ? 'taken' : 'save'}`);
  }
  redirect(`/zones/${slug}`);
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
): Promise<{ ok: boolean; slug?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const { supabase } = auth;

  const { data: slug, error } = await supabase.rpc('join_zone_via_code', {
    p_code: code,
  });
  if (error || typeof slug !== 'string') return { ok: false };
  revalidatePath('/zones');
  return { ok: true, slug };
}

/** Ask to be let into a private zone. The one thing a non-member may write. */
export async function requestToJoinZone(
  zoneId: string,
  note?: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase.from('zone_join_requests').insert({
    zone_id: zoneId,
    requester_id: user.id,
    note: note?.trim() ? note.trim().slice(0, 280) : null,
  });
  // Asking twice is not an error worth showing; the first ask still stands.
  if (error && error.code !== '23505') {
    return reportAndFail('SB-ZONE-SAVE', 'zone.join-request', error);
  }

  // Tell whoever can act on it. Organizers and moderators both can.
  const [{ data: zone }, { data: mods }] = await Promise.all([
    supabase.from('zones').select('name, organizer_id').eq('id', zoneId).maybeSingle(),
    supabase
      .from('zone_members')
      .select('member_id')
      .eq('zone_id', zoneId)
      .eq('role', 'moderator'),
  ]);
  const recipients = new Set<string>();
  if (zone?.organizer_id) recipients.add(zone.organizer_id);
  for (const mod of mods ?? []) recipients.add(mod.member_id);
  recipients.delete(user.id);
  if (recipients.size > 0) {
    await notifyUsers([...recipients], {
      kind: 'zone_join_request',
      title: `Someone asked to join ${zone?.name ?? 'your zone'}`,
      body: 'Open the zone to let them in or pass.',
      url: '/zones',
    });
  }

  revalidatePath('/zones');
  return { ok: true };
}

/** Approve or deny a pending request. Organizer/moderator only. */
export async function resolveZoneJoinRequest(
  requestId: string,
  approve: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  // Read the requester before resolving: once approved, the row's status
  // changes and we still want to tell them.
  const { data: request } = await supabase
    .from('zone_join_requests')
    .select('requester_id, zone_id')
    .eq('id', requestId)
    .maybeSingle();

  const { error } = await supabase.rpc('resolve_zone_join_request', {
    p_request: requestId,
    p_approve: approve,
  });
  if (error) {
    // The function raises for a caller who doesn't run the zone; that's an
    // authorization answer, not an outage.
    if (/not a moderator/i.test(error.message)) return failure('SB-ZONE-ACCESS');
    return reportAndFail('SB-ZONE-SAVE', 'zone.resolve-request', error);
  }

  if (approve && request?.requester_id) {
    const { data: zone } = await supabase
      .from('zones')
      .select('name, slug')
      .eq('id', request.zone_id)
      .maybeSingle();
    await notifyUsers([request.requester_id], {
      kind: 'zone_join_approved',
      title: `You're in ${zone?.name ?? 'the zone'}`,
      body: 'Check in whenever you get there.',
      url: zone?.slug ? `/zones/${zone.slug}` : '/zones',
    });
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

  const { error } = await supabase
    .from('zone_members')
    .delete()
    .eq('zone_id', zoneId)
    .eq('member_id', memberId);
  if (error) return reportAndFail('SB-ZONE-SAVE', 'zone.membership', error);

  revalidatePath('/zones');
  return { ok: true };
}
