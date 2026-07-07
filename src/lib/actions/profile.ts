'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { SOCIAL_BY_ID } from '@/lib/socials';
import type { ProfileLink, ProfileSocial } from '@/lib/types';

const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;
const MAX_LINKS = 15;
const MAX_SOCIALS = 15;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Accept only http(s) URLs; prepend https:// to a bare domain. Returns null
 *  for anything unsafe (javascript:, data:, malformed). */
function sanitizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseLinks(raw: string): ProfileLink[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const links: ProfileLink[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const url = sanitizeUrl(String((item as ProfileLink).url ?? ''));
    if (!url) continue;
    const label = String((item as ProfileLink).label ?? '').trim().slice(0, 60);
    let host = '';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    links.push({ label: label || host || 'Link', url });
    if (links.length >= MAX_LINKS) break;
  }
  return links;
}

function parseSocials(raw: string): ProfileSocial[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const socials: ProfileSocial[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const platform = String((item as ProfileSocial).platform ?? '');
    const value = String((item as ProfileSocial).value ?? '').trim().slice(0, 200);
    if (!SOCIAL_BY_ID[platform] || !value) continue;
    socials.push({ platform, value });
    if (socials.length >= MAX_SOCIALS) break;
  }
  return socials;
}

function nullableText(raw: FormDataEntryValue | null, max: number): string | null {
  const value = String(raw ?? '').trim();
  return value ? value.slice(0, max) : null;
}

/** Full profile edit: identity, presentation, links, socials, and contact.
 *  Media (avatar/cover) URLs are uploaded client-side to Supabase Storage and
 *  arrive here as already-hosted public URLs. */
export async function updateProfileDetails(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const displayName = String(formData.get('display_name') ?? '').trim();
  const handle = String(formData.get('handle') ?? '')
    .trim()
    .toLowerCase();

  if (!displayName) return { ok: false, error: 'Add your name.' };
  if (!HANDLE_PATTERN.test(handle)) {
    return { ok: false, error: 'Handle: 3–24 lowercase letters, numbers, or underscores.' };
  }

  const email = nullableText(formData.get('contact_email'), 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That email address looks off.' };
  }

  // Media URLs must live in our own Supabase storage buckets.
  const avatarUrl = nullableText(formData.get('avatar_url'), 500);
  const coverUrl = nullableText(formData.get('cover_url'), 500);
  const mediaOk = (u: string | null) =>
    u === null || /\/storage\/v1\/object\/public\/(avatars|covers)\//.test(u);
  if (!mediaOk(avatarUrl) || !mediaOk(coverUrl)) {
    return { ok: false, error: 'Unexpected image location — please re-upload.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName.slice(0, 80),
      handle,
      avatar_url: avatarUrl,
      cover_url: coverUrl,
      tagline: nullableText(formData.get('tagline'), 120),
      pronouns: nullableText(formData.get('pronouns'), 40),
      location: nullableText(formData.get('location'), 80),
      bio: nullableText(formData.get('bio'), 600),
      links: parseLinks(String(formData.get('links') ?? '[]')),
      socials: parseSocials(String(formData.get('socials') ?? '[]')),
      contact_email: email,
      contact_phone: nullableText(formData.get('contact_phone'), 40),
      contact_public: formData.get('contact_public') === 'on',
    })
    .eq('id', user.id);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'That handle is already taken.' };
    }
    return { ok: false, error: 'Could not save — please try again.' };
  }

  revalidatePath('/profile');
  revalidatePath('/settings');
  redirect('/profile');
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
