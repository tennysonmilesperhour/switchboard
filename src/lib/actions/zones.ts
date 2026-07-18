'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
    latitude: located ? lat : null,
    longitude: located ? lng : null,
  });
  if (error) {
    redirect(`/zones?error=${error.code === '23505' ? 'taken' : 'save'}`);
  }
  redirect(`/zones/${slug}`);
}
