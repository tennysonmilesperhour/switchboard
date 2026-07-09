'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUsers } from '@/lib/server/notify';

export interface ConnectionResult {
  ok: boolean;
  error?: string;
}

export async function sendConnectionRequest(handle: string): Promise<ConnectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const cleaned = handle.trim().toLowerCase().replace(/^@/, '');
  const { data: target } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('handle', cleaned)
    .maybeSingle();
  if (!target) return { ok: false, error: `No one with the handle @${cleaned}` };
  if (target.id === user.id) return { ok: false, error: 'That’s you!' };

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
