'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Card, SectionHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatRelative, formatDate } from '@/lib/format';
import {
  addBoardPost,
  deleteBoardPost,
  inviteToBoard,
  removeFromBoard,
} from '@/lib/actions/boards';

export interface BoardPostRow {
  id: string;
  author_id: string;
  kind: 'notice' | 'event';
  title: string;
  body: string | null;
  location: string | null;
  cadence: string | null;
  starts_at: string | null;
  created_at: string;
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
  const [kind, setKind] = useState<'notice' | 'event'>('notice');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [location, setLocation] = useState('');
  const [cadence, setCadence] = useState('');
  const [date, setDate] = useState('');
  const [postError, setPostError] = useState<string | null>(null);

  // Invite state.
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.name]));

  function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setPostError(null);
    startTransition(async () => {
      const result = await addBoardPost(boardId, {
        kind,
        title,
        body,
        location,
        cadence,
        startsAt: date ? new Date(`${date}T12:00`).toISOString() : null,
      });
      if (result.ok) {
        setTitle('');
        setBody('');
        setLocation('');
        setCadence('');
        setDate('');
        router.refresh();
      } else {
        setPostError(result.error ?? 'Could not post that.');
      }
    });
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
                  ['event', '🔁 Recurring event'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
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
                Post to the board
              </Button>
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
                            {post.kind === 'event' ? '🔁' : '📌'}
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
                      </div>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => removePost(post.id)}
                          disabled={pending}
                          className="rounded-pill px-2 py-1 text-[11px] text-ink-faint hover:text-rose-deep shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                        >
                          remove
                        </button>
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
      </section>
    </div>
  );
}
