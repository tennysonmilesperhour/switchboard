import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { BoardClient, type BoardPostRow, type BoardMemberRow } from './BoardClient';

function boardPostKind(kind: string): BoardPostRow['kind'] {
  switch (kind) {
    case 'event':
    case 'offer':
    case 'request':
      return kind;
    default:
      return 'notice';
  }
}

/** Posts per page. Older ones are a link away rather than silently gone. */
const PAGE_SIZE = 50;

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ before?: string | string[] }>;
}) {
  const { slug } = await params;
  const { before: rawBefore } = await searchParams;
  // `?before=<created_at>` walks back through older posts. Anything that isn't
  // a real timestamp is ignored rather than trusted into the query.
  const beforeValue = Array.isArray(rawBefore) ? rawBefore[0] : rawBefore;
  const before =
    beforeValue && Number.isFinite(Date.parse(beforeValue))
      ? new Date(beforeValue).toISOString()
      : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS only returns the board if the viewer is a member.
  const { data: board } = await supabase
    .from('boards')
    .select('id, slug, name, description, created_by')
    .eq('slug', slug)
    .maybeSingle();
  if (!board) notFound();

  // Expired offers/requests drop out at read time (the signals/moments
  // precedent) — no sweep needed; the rows stay until the author removes them.
  const nowIso = new Date().toISOString();
  let postsQuery = supabase
    .from('board_posts')
    .select('*, responses:board_post_responses(responder_id)')
    .eq('board_id', board.id)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    // One extra row answers "is there an older page?" without a count query.
    .limit(PAGE_SIZE + 1);
  if (before) postsQuery = postsQuery.lt('created_at', before);
  const [{ data: postRows }, { data: memberRows }] = await Promise.all([
    postsQuery,
    supabase
      .from('board_members')
      .select('member_id, role, joined_at, profile:profiles(display_name, handle)')
      .eq('board_id', board.id)
      .order('joined_at', { ascending: true }),
  ]);
  const hasOlder = (postRows ?? []).length > PAGE_SIZE;
  const pagePosts = (postRows ?? []).slice(0, PAGE_SIZE);
  const olderCursor = hasOlder ? pagePosts[pagePosts.length - 1]?.created_at ?? null : null;

  const members: BoardMemberRow[] = (memberRows ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.member_id,
      name: profile?.display_name ?? 'Member',
      handle: profile?.handle ?? null,
      role: row.role === 'moderator' ? 'moderator' : 'member',
      founder: row.member_id === board.created_by,
    };
  });
  const isModerator = members.some(
    (member) => member.id === user.id && member.role === 'moderator',
  );

  return (
    <AppShell title={board.name} back="/boards">
      <div className="space-y-6">
        <div className="rounded-card bg-ink text-paper p-6">
          <p className="text-xs uppercase tracking-widest text-gold-deep">
            Neighborhood Board
          </p>
          <h2 className="font-display text-3xl mt-1.5">{board.name}</h2>
          {board.description && (
            <p className="text-sm opacity-70 mt-2 leading-relaxed">{board.description}</p>
          )}
          <p className="text-sm opacity-70 mt-3">
            {members.length} {members.length === 1 ? 'neighbor' : 'neighbors'}
          </p>
        </div>

        <BoardClient
          boardId={board.id}
          slug={board.slug}
          currentUserId={user.id}
          isModerator={isModerator}
          isFounder={board.created_by === user.id}
          founderPresent={members.some((member) => member.founder)}
          boardName={board.name}
          boardDescription={board.description}
          initialPosts={pagePosts.map((post) => ({
            ...post,
            kind: boardPostKind(post.kind),
          }))}
          members={members}
          olderCursor={olderCursor}
          viewingOlder={before !== null}
        />
      </div>
    </AppShell>
  );
}
