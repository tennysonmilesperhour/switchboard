'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Card, SectionHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatRelative, formatDate } from '@/lib/format';
import {
  addBoardPost,
  deleteBoardPost,
  inviteToBoard,
  ensureBoardInviteLink,
  rotateBoardInviteLink,
  removeFromBoard,
  updateBoardPost,
  respondToBoardPost,
  fulfillBoardPost,
} from '@/lib/actions/boards';

export interface BoardPostRow {
  id: string;
  author_id: string;
  kind: 'notice' | 'event' | 'offer' | 'request';
  title: string;
  body: string | null;
  location: string | null;
  cadence: string | null;
  starts_at: string | null;
  created_at: string;
  updated_at: string | null;
  fulfilled_at: string | null;
}

export interface BoardMemberRow {
  id: string;
  name: string;
  role: 'member' | 'moderator';
}

interface BoardClientProps {
  boardId: string;
  slug: string;
  currentUserId: string;
  isModerator: boolean;
  initialPosts: BoardPostRow[];
  members: BoardMemberRow[];
}

export function BoardClient({
  boardId,
  slug,
  currentUserId,
  isModerator,
  initialPosts,
  members,
}: BoardClientProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  async function removePost(postId: string) {
    const ok = await confirm({
      title: 'Remove this post?',
      body: 'It’ll disappear from the board for everyone.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteBoardPost(postId, slug);
        router.refresh();
      } catch {
        toast.error('Could not remove the post. Try again.');
      }
    });
  }

  async function removeNeighbor(member: BoardMemberRow) {
    const ok = await confirm({
      title: `Remove ${member.name} from the board?`,
      body: 'They’ll lose access to this neighborhood board.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removeFromBoard(boardId, member.id);
        router.refresh();
      } catch {
        toast.error('Could not remove that neighbor. Try again.');
      }
    });
  }

  // Composer state.
  const [kind, setKind] = useState<'notice' | 'event' | 'offer' | 'request'>('notice');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [location, setLocation] = useState('');
  const [cadence, setCadence] = useState('');
  const [date, setDate] = useState('');
  const [postError, setPostError] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  // Invite state.
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.name]));

  function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setPostError(null);
    startTransition(async () => {
      const startsAt = date ? new Date(`${date}T12:00`).toISOString() : null;
      const result = editingPostId
        ? await updateBoardPost(editingPostId, slug, {
            title,
            body,
            location,
            cadence,
            startsAt,
          })
        : await addBoardPost(boardId, {
            kind,
            title,
            body,
            location,
            cadence,
            startsAt,
          });
      if (result.ok) {
        setTitle('');
        setBody('');
        setLocation('');
        setCadence('');
        setDate('');
        setEditingPostId(null);
        setKind('notice');
        toast.success(editingPostId ? 'Board post updated.' : 'Posted to the board.');
        router.refresh();
      } else {
        setPostError(result.error ?? 'Could not post that.');
      }
    });
  }

  function editPost(post: BoardPostRow) {
    setEditingPostId(post.id);
    setKind(post.kind);
    setTitle(post.title);
    setBody(post.body ?? '');
    setLocation(post.location ?? '');
    setCadence(post.cadence ?? '');
    setDate(post.starts_at ? post.starts_at.slice(0, 10) : '');
    setPostError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingPostId(null);
    setKind('notice');
    setTitle('');
    setBody('');
    setLocation('');
    setCadence('');
    setDate('');
    setPostError(null);
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteHandle.trim()) return;
    setInviteError(null);
    startTransition(async () => {
      const result = await inviteToBoard(boardId, inviteHandle);
      if (result.ok) {
        setInviteHandle('');
        router.refresh();
      } else {
        setInviteError(result.error ?? 'Could not add them.');
      }
    });
  }

  function createLink() {
    startTransition(async () => {
      const result = await ensureBoardInviteLink(boardId);
      if (result.ok && result.url) setInviteUrl(result.url);
      else toast.error(result.error ?? 'Could not create an invite link.', result.code);
    });
  }

  function rotateLink() {
    startTransition(async () => {
      const result = await rotateBoardInviteLink(boardId);
      if (result.ok && result.url) {
        setInviteUrl(result.url);
        toast.success('New link ready. The old one no longer works.');
      } else {
        toast.error(result.error ?? 'Could not refresh the link.', result.code);
      }
    });
  }

  return (
    <div className="space-y-7">
      {/* Composer */}
      <section>
        <form onSubmit={submitPost}>
          <Card>
            <div className="flex gap-2 mb-3">
              {(
                [
                  ['notice', '📌 Notice'],
                  ['event', '🔁 Recurring announcement'],
                  ['offer', '🤲 Offer'],
                  ['request', '🙋 Request'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={editingPostId !== null}
                  onClick={() => setKind(value)}
                  aria-pressed={kind === value}
                  className={`rounded-pill px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                    kind === value
                      ? 'bg-ink text-paper'
                      : 'bg-cream text-ink-soft hover:bg-line'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-2.5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder={
                  kind === 'event'
                    ? 'Saturday market walk'
                    : kind === 'offer'
                      ? 'Extra moving boxes available'
                      : kind === 'request'
                        ? 'Could someone lend a ladder?'
                    : 'Anyone have a ladder to lend?'
                }
                aria-label="Title"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                placeholder="Details (optional)"
                aria-label="Details"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta resize-none"
              />
              {kind === 'event' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                    placeholder="Every Saturday, 9am"
                    aria-label="How often"
                    className="rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                  />
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Where"
                    aria-label="Where"
                    className="rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                  />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="First date (optional)"
                    className="col-span-2 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                  />
                </div>
              )}
              {postError && <p className="text-xs text-rose-deep">{postError}</p>}
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={pending || !title.trim()}
              >
                {pending
                  ? 'Saving…'
                  : editingPostId
                    ? 'Save changes'
                    : 'Post to the board'}
              </Button>
              {editingPostId && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  disabled={pending}
                  onClick={cancelEdit}
                >
                  Cancel editing
                </Button>
              )}
            </div>
          </Card>
        </form>
      </section>

      {/* Posts */}
      <section>
        <SectionHeader title="On the board" />
        {initialPosts.length === 0 ? (
          <EmptyState
            emoji="📭"
            title="Nothing posted yet"
            body="Share the first notice or set up a recurring get-together."
          />
        ) : (
          <ul className="space-y-2.5">
            {initialPosts.map((post) => {
              const canRemove = post.author_id === currentUserId || isModerator;
              return (
                <li key={post.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span aria-hidden className="mr-1">
                            {post.kind === 'event' ? '🔁' : post.kind === 'offer' ? '🤲' : post.kind === 'request' ? '🙋' : '📌'}
                          </span>
                          {post.title}
                        </p>
                        {post.body && (
                          <p className="text-sm text-ink-soft mt-1 leading-relaxed break-words">
                            {post.body}
                          </p>
                        )}
                        {(post.cadence || post.location) && (
                          <p className="text-xs text-terracotta-deep mt-1.5">
                            {[post.cadence, post.location].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {post.starts_at && (
                          <p className="text-xs font-bold text-ink mt-1.5">
                            📅 First date: {formatDate(post.starts_at)}
                          </p>
                        )}
                        <p className="text-[11px] text-ink-faint mt-1.5">
                          {memberNames[post.author_id] ?? 'A neighbor'} ·{' '}
                          {formatRelative(post.created_at)}
                        </p>
                        {(post.kind === 'offer' || post.kind === 'request') && (
                          <div className="mt-2 flex items-center gap-2">
                            {post.fulfilled_at ? <span className="rounded-pill bg-sage-soft px-2.5 py-1 text-xs font-bold text-sage-deep">✓ Complete</span> : post.author_id === currentUserId ? <button type="button" onClick={() => startTransition(async () => { const result = await fulfillBoardPost(post.id, slug); if (!result.ok) toast.error(result.error ?? 'Could not update it.'); else router.refresh(); })} className="rounded-pill border border-line px-2.5 py-1 text-xs font-bold">Mark complete</button> : <button type="button" onClick={() => startTransition(async () => { const result = await respondToBoardPost(post.id, slug); if (!result.ok) toast.error(result.error ?? 'Could not respond.'); else toast.success('The neighbor was notified.'); })} className="rounded-pill bg-terracotta px-2.5 py-1 text-xs font-bold text-white">I can help</button>}
                          </div>
                        )}
                      </div>
                      {canRemove && (
                        <div className="flex shrink-0 items-center gap-1">
                          {post.author_id === currentUserId && (
                            <button
                              type="button"
                              onClick={() => editPost(post)}
                              disabled={pending}
                              className="rounded-pill px-2 py-1 text-[11px] font-semibold text-terracotta-deep hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                            >
                              edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removePost(post.id)}
                            disabled={pending}
                            className="rounded-pill px-2 py-1 text-[11px] text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                          >
                            remove
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Members */}
      <section>
        <SectionHeader
          title="Neighbors"
          hint={isModerator ? 'Invite-only - you moderate this board' : undefined}
        />
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-card bg-card border border-line px-3.5 py-2.5"
            >
              <Avatar name={member.name} seed={member.id} size="sm" />
              <span className="flex-1 font-medium">
                {member.name}
                {member.role === 'moderator' && (
                  <span className="ml-1.5 text-xs text-gold-deep rounded-pill bg-gold-soft px-1.5 py-0.5">
                    moderator
                  </span>
                )}
              </span>
              {isModerator && member.id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => removeNeighbor(member)}
                  disabled={pending}
                  className="rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {isModerator && (
          <form onSubmit={invite} className="flex items-center gap-2 mt-3">
            <div className="flex flex-1 items-center rounded-card border border-line bg-card focus-within:border-terracotta transition-colors">
              <span className="pl-3.5 text-ink-faint text-sm">@</span>
              <input
                value={inviteHandle}
                onChange={(e) => setInviteHandle(e.target.value.toLowerCase())}
                placeholder="handle"
                aria-label="Invite by handle"
                className="flex-1 bg-transparent px-1.5 py-2.5 text-sm outline-none lowercase"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={pending || !inviteHandle.trim()}
            >
              Invite
            </Button>
          </form>
        )}
        {inviteError && <p className="text-xs text-rose-deep mt-2">{inviteError}</p>}

        {isModerator && (
          <div className="mt-3">
            {inviteUrl ? (
              <Card tone="cream" className="space-y-2.5">
                <p className="text-sm text-ink-soft leading-relaxed">
                  Share this link. Anyone who opens it while signed in joins the
                  board as a neighbor.
                </p>
                <div className="flex items-center gap-2 rounded-card border border-line bg-paper px-3 py-2.5">
                  <a
                    href={inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate rounded text-sm font-semibold text-terracotta-deep underline decoration-terracotta/40 underline-offset-2 hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    title={inviteUrl}
                  >
                    {inviteUrl}
                  </a>
                  <CopyButton text={inviteUrl} />
                </div>
                <button
                  type="button"
                  onClick={rotateLink}
                  disabled={pending}
                  className="text-xs font-bold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta rounded-pill px-1"
                >
                  Replace with a new link
                </button>
              </Card>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={createLink}
              >
                {pending ? 'Creating…' : 'Create a shareable invite link 🔗'}
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
