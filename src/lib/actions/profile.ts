'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function completeOnboarding(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const displayName = String(formData.get('display_name') ?? '').trim();
  const handle = String(formData.get('handle') ?? '')
    .trim()
    .toLowerCase();
  const interests = formData.getAll('interests').map(String).filter(Boolean);
  const downTo = formData.getAll('down_to').map(String).filter(Boolean);

  if (!displayName) redirect('/onboarding?error=name');
  if (!HANDLE_PATTERN.test(handle)) redirect('/onboarding?error=handle');

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      handle,
      interests,
      down_to: downTo,
      timezone: String(formData.get('timezone') || 'UTC'),
      onboarded: true,
    })
    .eq('id', user.id);

  if (profileError) {
    const reason = profileError.code === '23505' ? 'handle_taken' : 'save';
    redirect(`/onboarding?error=${reason}`);
  }

  // Starter circles - reused across signals, visibility, and invite lists.
  const { data: existing } = await supabase
    .from('circles')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('circles').insert([
      { owner_id: user.id, name: 'Close Friends', emoji: '💛' },
      { owner_id: user.id, name: 'Family', emoji: '🏡' },
      { owner_id: user.id, name: 'Neighbors', emoji: '🌳' },
    ]);
  }

  redirect('/');
}

export async function updateInterests(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const interests = formData.getAll('interests').map(String).filter(Boolean);
  const downTo = formData.getAll('down_to').map(String).filter(Boolean);

  await supabase
    .from('profiles')
    .update({ interests, down_to: downTo })
    .eq('id', user.id);

  revalidatePath('/settings');
}

export async function updateSabbatical(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const on = formData.get('sabbatical') === 'on';
  const message = String(formData.get('sabbatical_message') ?? '').trim();

  await supabase
    .from('profiles')
    .update({
      sabbatical: on,
      sabbatical_message: on ? message || null : null,
    })
    .eq('id', user.id);

  // Entering a quiet season pulls down any live availability signal so you
  // stop appearing on friends' radars right away.
  if (on) {
    await supabase.from('availability_signals').delete().eq('user_id', user.id);
  }

  revalidatePath('/settings');
  revalidatePath('/');
}

export async function updateQuietHours(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const rawStart = formData.get('quiet_start');
  const rawEnd = formData.get('quiet_end');
  const start = rawStart === '' || rawStart === null ? null : Number(rawStart);
  const end = rawEnd === '' || rawEnd === null ? null : Number(rawEnd);

  await supabase
    .from('profiles')
    .update({ quiet_hours_start: start, quiet_hours_end: end })
    .eq('id', user.id);

  revalidatePath('/settings');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/welcome');
}
