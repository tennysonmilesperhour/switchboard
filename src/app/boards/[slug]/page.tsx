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

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS only returns the board if the viewer is a member.
  const { data: board } = await supabase
    .from('boards')
    .select('id, slug, name, description')
    .eq('slug', slug)
    .maybeSingle();
  if (!board) notFound();

  // Expired offers/requests drop out at read time (the signals/moments
  // precedent) — no sweep needed; the rows stay until the author removes them.
  const nowIso = new Date().toISOString();
  const [{ data: postRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from('board_posts')
      .select('*, responses:board_post_responses(responder_id)')
      .eq('board_id', board.id)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('board_members')
      .select('member_id, role, profile:profiles(display_name)')
      .eq('board_id', board.id),
  ]);

  const members: BoardMemberRow[] = (memberRows ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.member_id,
      name: profile?.display_name ?? 'Member',
      role: row.role === 'moderator' ? 'moderator' : 'member',
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
          <h2 className="font-display text-3xl mt-1.5">🏘️ {board.name}</h2>
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
          initialPosts={(postRows ?? []).map((post) => ({
            ...post,
            kind: boardPostKind(post.kind),
          }))}
          members={members}
        />
      </div>
    </AppShell>
  );
}
