'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

export async function createBoard(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const slug = slugify(name);
  if (!name || slug.length < 3) redirect('/boards?error=name');

  const { data, error } = await supabase.rpc('create_board', {
    p_name: name,
    p_slug: slug,
    p_description: description,
  });
  if (error) {
    if (error.code === '23505') redirect('/boards?error=taken');
    // Surface the real reason for anything unexpected instead of a blank
    // "try again", so the host (and we) can see what actually failed.
    redirect(`/boards?error=save&reason=${encodeURIComponent(error.message)}`);
  }
  redirect(`/boards/${data ?? slug}`);
}

export async function inviteToBoard(
  boardId: string,
  handle: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '');
  if (!cleanHandle) return { ok: false, error: 'Enter a handle.' };

  // Only a board moderator may add people — don't rely solely on RLS (SB-20).
  const { data: myRole } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('member_id', user.id)
    .maybeSingle();
  if (myRole?.role !== 'moderator') {
    return { ok: false, error: 'Only a board organizer can add people.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', cleanHandle)
    .maybeSingle();
  if (!profile) return { ok: false, error: 'No one with that handle.' };

  const { error } = await supabase
    .from('board_members')
    .insert({ board_id: boardId, member_id: profile.id, role: 'member' });
  if (error) {
    const already = error.code === '23505';
    return {
      ok: false,
      error: already ? 'They’re already on this board.' : error.message,
    };
  }

  revalidatePath(`/boards`);
  return { ok: true };
}

export async function removeFromBoard(
  boardId: string,
  memberId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  await supabase
    .from('board_members')
    .delete()
    .eq('board_id', boardId)
    .eq('member_id', memberId);
  revalidatePath('/boards');
}

export async function addBoardPost(
  boardId: string,
  input: {
    kind: 'notice' | 'event';
    title: string;
    body: string;
    location: string;
    cadence: string;
    startsAt: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give it a title.' };

  const { error } = await supabase.from('board_posts').insert({
    board_id: boardId,
    author_id: user.id,
    kind: input.kind,
    title,
    body: input.body.trim() || null,
    location: input.location.trim() || null,
    cadence: input.cadence.trim() || null,
    starts_at: input.startsAt,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/boards');
  return { ok: true };
}

export async function deleteBoardPost(
  postId: string,
  slug: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('board_posts').delete().eq('id', postId);
  revalidatePath(`/boards/${slug}`);
}
