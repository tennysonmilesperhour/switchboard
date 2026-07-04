'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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

  const { error } = await supabase.from('zones').insert({
    slug,
    name,
    description: description || null,
    organizer_id: user.id,
    experiences,
  });
  if (error) {
    redirect(`/zones?error=${error.code === '23505' ? 'taken' : 'save'}`);
  }
  redirect(`/zones/${slug}`);
}
