'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { notifyUsers, sendPushToUsers } from '@/lib/server/notify';
import { normalizePhoneNumber } from '@/lib/phone';
import { checkRateLimit } from '@/lib/server/rate-limit';

/** PostgREST `.or()` filters are built by string interpolation below; only ever
 *  feed them DB-issued UUIDs. Assert that before interpolating (SB-29). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(value: string): string {
  if (!UUID_RE.test(value)) throw new Error('Expected a UUID');
  return value;
}

export interface ConnectionResult {
  ok: boolean;
  error?: string;
}

export interface ContactCandidate {
  name: string;
  emails: string[];
  phones: string[];
}

export interface ContactMatch {
  key: string;
  name: string;
  identifier: string;
  kind: 'handle' | 'email' | 'account_email' | 'phone';
  profile: {
    id: string;
    name: string;
    handle: string;
  } | null;
  connectionStatus: 'none' | 'incoming' | 'outgoing' | 'accepted' | 'self';
  smsTarget: string | null;
}

interface ResolvedProfile {
  id: string;
  display_name: string;
  handle: string;
  match_kind: ContactMatch['kind'];
}

async function resolveProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  identifier: string,
): Promise<ResolvedProfile | null> {
  const { data } = await supabase
    .rpc('resolve_profile_contact', { p_identifier: identifier })
    .maybeSingle<ResolvedProfile>();
  return data ?? null;
}

async function connectionStatusFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  targetId: string,
): Promise<ContactMatch['connectionStatus']> {
  if (targetId === userId) return 'self';
  assertUuid(userId);
  assertUuid(targetId);
  const { data } = await supabase
    .from('connections')
    .select('requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`)
    .maybeSingle();
  if (!data) return 'none';
  if (data.status === 'accepted') return 'accepted';
  return data.requester_id === userId ? 'outgoing' : 'incoming';
}

export async function sendConnectionRequest(identifier: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`connect-request:${user.id}`, 30, 60 * 60))) {
    return { ok: false, error: 'You’re sending a lot of requests. Try again later.' };
  }

  const cleaned = identifier.trim();
  if (!cleaned) return { ok: false, error: 'Enter a handle, email, or phone number.' };
  const target = await resolveProfile(supabase, cleaned);
  if (!target) return { ok: false, error: 'No Switchboard account matched that handle, email, or phone.' };
  if (target.id === user.id) return { ok: false, error: 'That is you.' };

  const { error } = await supabase.from('connections').insert({
    requester_id: user.id,
    addressee_id: target.id,
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Request already sent' };
    return { ok: false, error: error.message };
  }

  await sendPushToUsers([target.id], {
    title: 'New connection request',
    body: 'Someone wants to connect on Switchboard.',
    url: '/people',
  });
  revalidatePath('/people');
  return { ok: true };
}

/**
 * Send a connection request to a known profile id. Used where the target is
 * already resolved (e.g. an event host) so we don't need to round-trip a
 * handle — and it works even for accounts without a handle set.
 */
export async function sendConnectionRequestToId(
  targetId: string,
): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!UUID_RE.test(targetId)) return { ok: false, error: 'Unknown person.' };
  if (targetId === user.id) return { ok: false, error: 'That is you.' };

  if (!(await checkRateLimit(`connect-request:${user.id}`, 30, 60 * 60))) {
    return { ok: false, error: 'You’re sending a lot of requests. Try again later.' };
  }

  // Confirm the target actually exists before inserting; a bad id would
  // otherwise surface only as an opaque FK error.
  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', targetId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'That account no longer exists.' };

  const { error } = await supabase.from('connections').insert({
    requester_id: user.id,
    addressee_id: targetId,
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Request already sent' };
    return { ok: false, error: error.message };
  }

  await sendPushToUsers([targetId], {
    title: 'New connection request',
    body: 'Someone wants to connect on Switchboard.',
    url: '/people',
  });
  revalidatePath('/people');
  return { ok: true };
}

export async function resolveContactMatches(
  contacts: ContactCandidate[],
): Promise<ContactMatch[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // resolveProfile is an account-existence oracle; throttle bulk lookups so a
  // contact list can't be used to enumerate who's on Switchboard (SB-12).
  if (!(await checkRateLimit(`contact-match:${user.id}`, 10, 60 * 60))) {
    return [];
  }

  const cleanedContacts = contacts.slice(0, 100).map((contact, index) => ({
    key: `${index}-${contact.name || contact.emails[0] || contact.phones[0] || 'contact'}`,
    name: contact.name.trim() || contact.emails[0] || contact.phones[0] || 'Contact',
    emails: contact.emails.map((email) => email.trim()).filter(Boolean).slice(0, 5),
    phones: contact.phones.map((phone) => phone.trim()).filter(Boolean).slice(0, 5),
  }));

  const rows: ContactMatch[] = [];
  for (const contact of cleanedContacts) {
    const identifiers = [...contact.emails, ...contact.phones];
    let resolved: ResolvedProfile | null = null;
    let matchedIdentifier = identifiers[0] ?? '';
    for (const identifier of identifiers) {
      resolved = await resolveProfile(supabase, identifier);
      if (resolved) {
        matchedIdentifier = identifier;
        break;
      }
    }

    const smsTarget =
      contact.phones.map(normalizePhoneNumber).find((phone): phone is string => Boolean(phone)) ??
      null;
    const connectionStatus = resolved
      ? await connectionStatusFor(supabase, user.id, resolved.id)
      : 'none';

    rows.push({
      key: contact.key,
      name: contact.name,
      identifier: matchedIdentifier || smsTarget || '',
      kind: resolved?.match_kind ?? 'phone',
      profile: resolved
        ? {
            id: resolved.id,
            name: resolved.display_name,
            handle: resolved.handle,
          }
        : null,
      connectionStatus,
      smsTarget,
    });
  }

  return rows;
}

export async function acceptConnection(connectionId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // RLS restricts this update to the addressee; the returned row is readable
  // because the accepter is a participant on it.
  const { data: updated, error } = await supabase
    .from('connections')
    .update({ status: 'accepted' })
    .eq('id', connectionId)
    .select('requester_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  // RLS restricts this update to the addressee; a null row means nothing was
  // updated (not the addressee, or already gone) — report it instead of a
  // false success (SB-18).
  if (!updated) {
    return { ok: false, error: 'That request is no longer available.' };
  }

  if (updated?.requester_id) {
    const { data: me } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    await notifyUsers([updated.requester_id], {
      kind: 'connection_accepted',
      title: 'You’re connected 🎉',
      body: `${me?.display_name ?? 'Someone'} accepted your connection request.`,
      url: '/people',
    });
  }
  revalidatePath('/people');
  return { ok: true };
}

export async function removeConnection(connectionId: string): Promise<ConnectionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('connections').delete().eq('id', connectionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}

export async function blockProfile(
  profileId: string,
  connectionId?: string,
): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (profileId === user.id) return { ok: false, error: 'You cannot block yourself.' };

  const { error } = await supabase.from('profile_blocks').insert({
    blocker_id: user.id,
    blocked_id: profileId,
  });
  if (error && error.code !== '23505') return { ok: false, error: error.message };
  if (connectionId) {
    await supabase.from('connections').delete().eq('id', connectionId);
  }
  revalidatePath('/people');
  return { ok: true };
}

/**
 * "Give space" — a private, one-directional avoidance. Unlike a block, you stay
 * connected; it only powers a quiet heads-up when this person is going to be
 * somewhere you are. Invisible to them (RLS scopes the row to the avoider), and
 * it never removes anyone from anything: warn, never remove.
 */
export async function giveSpace(profileId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(profileId)) return { ok: false, error: 'Unknown person.' };
  if (profileId === user.id) return { ok: false, error: 'That is you.' };

  const { error } = await supabase
    .from('profile_avoids')
    .insert({ avoider_id: user.id, avoided_id: profileId });
  // Already on the list is a no-op success, not an error.
  if (error && error.code !== '23505') return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}

export async function stopGivingSpace(profileId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('profile_avoids')
    .delete()
    .eq('avoider_id', user.id)
    .eq('avoided_id', profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}

export async function reportProfile(
  profileId: string,
  reason: string,
): Promise<ConnectionResult> {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) return { ok: false, error: 'Add a short reason.' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Throttle so reports can't be used to flood moderation / mass-target a user.
  if (!(await checkRateLimit(`report:${user.id}`, 10, 60 * 60))) {
    return { ok: false, error: 'You’ve filed several reports. Try again later.' };
  }

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: user.id,
    reported_id: profileId,
    reason: cleanReason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function toggleCircleMember(
  circleId: string,
  memberId: string,
  add: boolean,
): Promise<ConnectionResult> {
  const supabase = await createClient();
  const { error } = add
    ? await supabase.from('circle_members').insert({ circle_id: circleId, member_id: memberId })
    : await supabase
        .from('circle_members')
        .delete()
        .eq('circle_id', circleId)
        .eq('member_id', memberId);
  if (error && error.code !== '23505') return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}

export async function createCircle(name: string, emoji: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Circle needs a name' };
  const { error } = await supabase
    .from('circles')
    .insert({ owner_id: user.id, name: trimmed.slice(0, 40), emoji: emoji.trim().slice(0, 8) || '👥' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}

export async function renameCircle(
  circleId: string,
  name: string,
  emoji?: string,
): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Circle needs a name' };
  const patch: { name: string; emoji?: string } = { name: trimmed.slice(0, 40) };
  const cleanEmoji = emoji?.trim().slice(0, 8);
  if (cleanEmoji) patch.emoji = cleanEmoji;
  // RLS already scopes this to the owner; the owner_id filter is defense in
  // depth so a stray id can never touch someone else's circle (SB-20).
  const { error } = await supabase
    .from('circles')
    .update(patch)
    .eq('id', circleId)
    .eq('owner_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}

export async function deleteCircle(circleId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  // circle_members rows cascade-delete with the circle (FK on delete cascade);
  // the connections themselves are untouched — only this grouping goes away.
  const { error } = await supabase
    .from('circles')
    .delete()
    .eq('id', circleId)
    .eq('owner_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}
