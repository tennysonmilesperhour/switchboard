'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUsers } from '@/lib/server/notify';
import { normalizePhoneNumber } from '@/lib/phone';

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

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

export async function resolveContactMatches(
  contacts: ContactCandidate[],
): Promise<ContactMatch[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

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
  const supabase = await createClient();
  const { error } = await supabase
    .from('connections')
    .update({ status: 'accepted' })
    .eq('id', connectionId);
  if (error) return { ok: false, error: error.message };
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
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

export async function reportProfile(
  profileId: string,
  reason: string,
): Promise<ConnectionResult> {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) return { ok: false, error: 'Add a short reason.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Circle needs a name' };
  const { error } = await supabase
    .from('circles')
    .insert({ owner_id: user.id, name: trimmed, emoji: emoji || '👥' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/people');
  return { ok: true };
}
