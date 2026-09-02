'use server';

import type { ActionResult } from '@/lib/errors';
import { failure } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';
import { checkRateLimit } from '@/lib/server/rate-limit';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser, requireUserOrRedirect } from '@/lib/server/require-user';
import { normalizeUsername } from '@/lib/auth-identity';
import { boardJoinUrl } from '@/lib/links';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { createEvent } from '@/lib/actions/events';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

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
): Promise<ActionResult> {
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
): Promise<ActionResult & { url?: string }> {
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
): Promise<ActionResult & { url?: string }> {
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
    kind: 'notice' | 'event' | 'offer' | 'request';
    title: string;
    body: string;
    location: string;
    cadence: string;
    startsAt: string | null;
    expiresAt?: string | null;
  },
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give it a title.' };

  // "Listed until" applies only to offers/requests, and stays within a
  // sensible window so a typo can't pin a stale ask to the board for years.
  let expiresAt: string | null = null;
  if (input.expiresAt && (input.kind === 'offer' || input.kind === 'request')) {
    const parsed = new Date(input.expiresAt);
    const fromNowMs = parsed.getTime() - Date.now();
    if (Number.isNaN(parsed.getTime()) || fromNowMs <= 0 || fromNowMs > 90 * 86_400_000) {
      return { ok: false, error: 'Pick a listing window within the next 90 days.' };
    }
    expiresAt = parsed.toISOString();
  }

  const { error } = await supabase.from('board_posts').insert({
    board_id: boardId,
    author_id: user.id,
    kind: input.kind,
    title,
    body: input.body.trim() || null,
    location: input.location.trim() || null,
    cadence: input.cadence.trim() || null,
    starts_at: input.startsAt,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  await capture(user.id, ANALYTICS_EVENTS.boardPostCreated, { kind: input.kind });
  revalidatePath('/boards');
  return { ok: true };
}

export async function respondToBoardPost(
  postId: string,
  slug: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase.from('board_post_responses').insert({
    post_id: postId,
    responder_id: auth.user.id,
  });
  if (error?.code === '23505') return { ok: true };
  if (error) return { ok: false, error: error.message };
  const admin = createAdminClient();
  const [{ data: post }, { data: responder }] = await Promise.all([
    admin.from('board_posts').select('author_id, title, kind').eq('id', postId).maybeSingle(),
    auth.supabase.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle(),
  ]);
  if (post && post.author_id !== auth.user.id) {
    // Name the neighbor — an anonymous "someone can help" leaves the author
    // with no way to close the loop.
    await notifyUsers([post.author_id], {
      kind: 'board_response',
      title: 'A neighbor can help',
      body: `${responder?.display_name ?? 'A neighbor'} responded to “${post.title}”.`,
      url: `/boards/${slug}`,
    });
  }
  await capture(auth.user.id, ANALYTICS_EVENTS.boardPostResponse, { kind: post?.kind ?? null });
  revalidatePath(`/boards/${slug}`);
  return { ok: true };
}

export async function fulfillBoardPost(postId: string, slug: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from('board_posts').update({ fulfilled_at: new Date().toISOString(), fulfilled_by: auth.user.id }).eq('id', postId).eq('author_id', auth.user.id).select('id, kind').maybeSingle();
  if (error || !data) return { ok: false, error: 'Only the author can mark this complete.' };
  await capture(auth.user.id, ANALYTICS_EVENTS.boardPostFulfilled, { kind: data.kind });
  revalidatePath(`/boards/${slug}`);
  return { ok: true };
}

export async function updateBoardPost(
  postId: string,
  slug: string,
  input: {
    title: string;
    body: string;
    location: string;
    cadence: string;
    startsAt: string | null;
  },
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false, error: 'Give it a title.' };

  // The author predicate is repeated here even though RLS enforces it. A
  // successful request that updated zero rows must not be presented as saved.
  const { data, error } = await supabase
    .from('board_posts')
    .update({
      title,
      body: input.body.trim() || null,
      location: input.location.trim() || null,
      cadence: input.cadence.trim() || null,
      starts_at: input.startsAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .eq('author_id', user.id)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: 'Could not save that post.' };
  if (!data) return { ok: false, error: 'Only the author can edit this post.' };

  revalidatePath(`/boards/${slug}`);
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

/**
 * Report a single board post.
 *
 * Reporting the author was the only option before this, which is both heavier
 * than most reporters mean and less useful than it sounds: a moderator got a
 * name and a prose description, then had to go find the post — by which time
 * there might be a dozen more. This names the post itself.
 *
 * `reported_id` is still the author, so the report lands in the one moderation
 * queue with the one resolution path (see the migration). The reporter never
 * learns anything about the author they could not already see, and the post's
 * own text is carried into the queue so a deletion between report and review
 * does not leave a moderator with nothing to judge.
 */
export async function reportBoardPost(
  postId: string,
  reason: string,
): Promise<ActionResult> {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) return { ok: false, error: 'Add a short reason.' };

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // The post must be one this person can actually see. Reading it through their
  // own client means board membership is enforced by the same policy that
  // governs the board itself — a stranger cannot probe for post ids.
  const { data: post } = await supabase
    .from('board_posts')
    .select('id, author_id, board_id')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return failure('SB-POST-MISSING');

  if (post.author_id === user.id) {
    return { ok: false, error: 'That’s your own post.' };
  }

  // Same budget as profile reports: enough for a bad afternoon on a board,
  // not enough to flood the queue or mass-target one person.
  if (!(await checkRateLimit(`report:${user.id}`, 10, 60 * 60))) {
    return { ok: false, error: 'You’ve filed several reports. Try again later.' };
  }

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: user.id,
    reported_id: post.author_id,
    target_kind: 'board_post',
    target_id: post.id,
    reason: cleanReason,
  });
  // Filing twice is the same report, not a failure the reporter needs to see.
  if (error && error.code !== '23505') {
    return reportAndFail('SB-POST-REPORT', 'board.report-post', error);
  }
  return { ok: true };
}

/**
 * Turn a board announcement into a real plan.
 *
 * A board post is a notice: "Saturday pickup game, 9am, usually the north
 * field". Nobody can say they're coming, nobody sees who else is in, and there
 * is no reminder — so the coordination the post is *about* happens somewhere
 * else, or not at all. Doing it by hand meant retyping the post into the wizard
 * and leaving the board still showing the old notice with no way through.
 *
 * Only the post's author may do this, and not because of a permission model:
 * creating the plan makes them its host, and volunteering someone else to host
 * is not a thing one neighbour should be able to do to another.
 *
 * The plan is reachable through its **share link**, not through a new
 * board-scoped visibility rule. `src/lib/share-link.ts` is the single authority
 * on what an invite URL does (`hostCanShare ⊆ canReadPlan`), and inventing a
 * second path by which a non-invitee may read a plan is precisely the drift
 * that broke invite links over and over. A board member follows the same URL a
 * host would text anyone.
 */
export async function planFromBoardPost(postId: string): Promise<ActionResult & { eventId?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Read through the caller's own client: board membership is enforced by the
  // board's own policy, so a stranger cannot turn someone else's notice into
  // anything, or probe for post ids.
  const { data: post } = await supabase
    .from('board_posts')
    .select('id, author_id, title, body, location, starts_at, event_id')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return failure('SB-POST-MISSING');

  // Already done. Returning the existing plan rather than an error means a
  // double tap, a slow network, or two open tabs all land on the same place
  // instead of creating a second half-populated plan with the same title.
  if (post.event_id) return { ok: true, eventId: post.event_id };

  if (post.author_id !== user.id) {
    return failure('SB-POST-AUTHOR');
  }

  // A start time that has already passed is common on a standing notice
  // ("every Saturday"), and createEvent rejects it. Drop it rather than refuse:
  // an undated plan people can answer beats no plan at all, and the host can
  // set the date in one edit.
  const startsAt =
    post.starts_at && new Date(post.starts_at).getTime() > Date.now() ? post.starts_at : null;

  const created = await createEvent({
    title: post.title,
    description: post.body,
    locationName: post.location,
    locationAddress: null,
    latitude: null,
    longitude: null,
    startsAt,
    endsAt: null,
    timeZone: null,
    capacity: null,
    inviteMode: 'all_at_once',
    openTable: false,
    // The board already knows who is around; the plan's own list starts empty
    // and fills as people answer the link.
    showInviteList: false,
    showAccepted: true,
    showExpired: false,
    enablePoll: false,
    pollResolution: 'host_pick',
    suggestDeadline: null,
    voteDeadline: null,
    remindersEnabled: true,
    invitees: [],
  });
  if (!created.ok || !created.eventId) {
    return { ok: false, error: created.error ?? 'Could not create the plan.' };
  }

  const { error } = await supabase
    .from('board_posts')
    .update({ event_id: created.eventId })
    .eq('id', post.id)
    .eq('author_id', user.id);
  if (error) {
    // The plan exists and the author is its host; only the board's pointer is
    // missing. Say so rather than implying nothing happened — otherwise they
    // tap again and get a second plan.
    return reportAndFail('SB-POST-LINK', 'board.post-to-plan', error);
  }

  revalidatePath('/boards');
  return { ok: true, eventId: created.eventId };
}
