'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser, requireUserOrRedirect } from '@/lib/server/require-user';
import { normalizeUsername } from '@/lib/auth-identity';
import { boardJoinUrl } from '@/lib/links';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

export async function createBoard(formData: FormData): Promise<void> {
  const { supabase } = await requireUserOrRedirect();

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
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const cleanHandle = normalizeUsername(handle);
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

/**
 * Mint (or fetch) the board's shareable invite code and return the full join
 * URL. Moderator-only — enforced inside the security-definer function.
 */
export async function ensureBoardInviteLink(
  boardId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: code, error } = await supabase.rpc('ensure_board_invite_code', {
    p_board: boardId,
  });
  if (error || typeof code !== 'string') {
    return { ok: false, error: 'Could not create an invite link.' };
  }
  revalidatePath('/boards');
  return { ok: true, url: boardJoinUrl(code) };
}

/**
 * Rotate the invite code, invalidating any link already shared. Moderator-only.
 */
export async function rotateBoardInviteLink(
  boardId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: code, error } = await supabase.rpc('rotate_board_invite_code', {
    p_board: boardId,
  });
  if (error || typeof code !== 'string') {
    return { ok: false, error: 'Could not refresh the invite link.' };
  }
  revalidatePath('/boards');
  return { ok: true, url: boardJoinUrl(code) };
}

/**
 * Redeem an invite code: join the caller to the board and return its slug (or
 * null for an unknown code). Used by the /boards/join/[code] landing page.
 */
export async function joinBoardViaCode(
  code: string,
): Promise<{ ok: boolean; slug?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const { supabase } = auth;

  const { data: slug, error } = await supabase.rpc('join_board_via_code', {
    p_code: code,
  });
  if (error || typeof slug !== 'string') return { ok: false };
  revalidatePath('/boards');
  return { ok: true, slug };
}

export async function removeFromBoard(
  boardId: string,
  memberId: string,
): Promise<void> {
  const { supabase } = await requireUserOrRedirect();
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
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

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
