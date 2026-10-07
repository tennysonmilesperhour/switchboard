'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmDialog';
import { formatRelative, formatDate } from '@/lib/format';
import { errorRef, type ErrorCode } from '@/lib/errors';
import {
  addBoardPost,
  deleteBoardPost,
  planFromBoardPost,
  reportBoardPost,
  updateBoardPost,
  respondToBoardPost,
  fulfillBoardPost,
  withdrawBoardResponse,
} from '@/lib/actions/boards';
import { BoardSettings } from './BoardSettings';
import { BoardMembers } from './BoardMembers';
import { Glyph } from '@/components/ui/Glyph';

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
  /** Set once this announcement has been turned into a real plan. */
  event_id: string | null;
  expires_at: string | null;
  responses?: { responder_id: string }[] | null;
}

export interface BoardMemberRow {
  id: string;
  name: string;
  /** For a link to their profile — how "Can help: Alice" reaches Alice. */
  handle: string | null;
  role: 'member' | 'moderator';
  /** The person who started the board. */
  founder: boolean;
}

interface BoardClientProps {
  boardId: string;
  slug: string;
  currentUserId: string;
  isModerator: boolean;
  isFounder: boolean;
  /** Whether the founder is still on the board (decides who may delete it). */
  founderPresent: boolean;
  boardName: string;
  boardDescription: string | null;
  initialPosts: BoardPostRow[];
  members: BoardMemberRow[];
  /** `created_at` of the last post shown, when older ones exist. */
  olderCursor: string | null;
  /** This page is an older one, reached through "Older posts". */
  viewingOlder: boolean;
}

/** Post and member actions: text links, but 44px tall so a thumb can hit them. */
const ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-pill px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta';

export function BoardClient({
  boardId,
  slug,
  currentUserId,
  isModerator,
  isFounder,
  founderPresent,
  boardName,
  boardDescription,
  initialPosts,
  members,
  olderCursor,
  viewingOlder,
}: BoardClientProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const askReason = usePrompt();

  /**
   * Flag one post.
   *
   * Reporting the author was the only option before this — heavier than most
   * people mean, and it left a moderator hunting for which post it was about.
   *
   * The prompt is deliberately plain rather than a menu of categories: a
   * sentence in the reporter's own words is what a human moderator can actually
   * act on, and a category list invites people to pick the closest wrong one.
   */
  async function flagPost(postId: string) {
    const reason = await askReason({
      title: 'What’s wrong with this post?',
      body: 'A sentence is plenty. A moderator reads it, and the author is never told who flagged it.',
      confirmLabel: 'Send to moderators',
    });
    if (!reason) return;
    startTransition(async () => {
      try {
        const result = await reportBoardPost(postId, reason);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not send that report.', result.code);
          return;
        }
        // No count, no public mark on the post: a reporter learns only that it
        // was received, and the author is never told who flagged them.
        toast.success('Sent to the moderators. Thanks for flagging it.');
      } catch {
        toast.error('Could not send that report. Try again.');
      }
    });
  }

  /**
   * Promote your own announcement to a real plan.
   *
   * The board keeps the post — people are still reading it — and gains a way
   * through to somewhere answers, a guest list and reminders exist.
   */
  function makePlan(postId: string) {
    startTransition(async () => {
      try {
        const result = await planFromBoardPost(postId);
        if (!result.ok || !result.eventId) {
          toast.error(result.error ?? 'Could not make that a plan.', result.code);
          return;
        }
        router.push(`/events/${result.eventId}`);
      } catch {
        toast.error('Could not make that a plan. Try again.');
      }
    });
  }

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
        const result = await deleteBoardPost(postId, slug);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not remove the post.', result.code);
          return;
        }
        toast.success('Post removed.');
        router.refresh();
      } catch {
        toast.error('Could not remove the post. Try again.');
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
  const [listedDays, setListedDays] = useState<number | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [postErrorCode, setPostErrorCode] = useState<ErrorCode | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setPostError(null);
    setPostErrorCode(null);
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
            expiresAt:
              listedDays && (kind === 'offer' || kind === 'request')
                ? new Date(Date.now() + listedDays * 86_400_000).toISOString()
                : null,
          });
      if (result.ok) {
        setTitle('');
        setBody('');
        setLocation('');
        setCadence('');
        setDate('');
        setListedDays(null);
        setEditingPostId(null);
        setKind('notice');
        toast.success(editingPostId ? 'Board post updated.' : 'Posted to the board.');
        router.refresh();
      } else {
        setPostError(result.error ?? 'Could not post that.');
        setPostErrorCode(result.code ?? null);
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
    setListedDays(null);
    setPostError(null);
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
                  ['notice', 'Notice'],
                  ['event', 'Recurring announcement'],
                  ['offer', 'Offer'],
                  ['request', 'Request'],
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
              {(kind === 'offer' || kind === 'request') && !editingPostId && (
                <>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Listed until">
                    <span className="text-xs text-ink-faint mr-0.5">Listed for</span>
                    {(
                      [
                        [null, 'No limit'],
                        [3, '3 days'],
                        [7, '1 week'],
                        [14, '2 weeks'],
                        [30, '1 month'],
                      ] as const
                    ).map(([days, label]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setListedDays(days)}
                        aria-pressed={listedDays === days}
                        className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                          listedDays === days
                            ? 'bg-ink text-paper'
                            : 'bg-cream text-ink-soft hover:bg-line'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-faint leading-relaxed">
                    Lending and giving are arranged between neighbors — Switchboard
                    doesn’t hold deposits or guarantee returns.
                  </p>
                </>
              )}
              {postError && (
                <p role="alert" className="text-xs text-rose-deep">
                  {postError}
                  {postErrorCode && <span className="ml-2 opacity-70">{errorRef(postErrorCode)}</span>}
                </p>
              )}
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
                // The id a board-post notification links to. `scroll-mt` keeps
                // the anchored post clear of the sticky header it lands under.
                <li key={post.id} id={`post-${post.id}`} className="scroll-mt-24">
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <Glyph
                            emoji={post.kind === 'event' ? '🔁' : post.kind === 'offer' ? '🤲' : post.kind === 'request' ? '🙋' : '📌'}
                            size={16}
                            className="mr-1.5 inline align-text-bottom"
                          />
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
                            First date: {formatDate(post.starts_at)}
                          </p>
                        )}
                        <p className="text-[11px] text-ink-faint mt-1.5">
                          {memberNames[post.author_id] ?? 'A neighbor'} ·{' '}
                          {formatRelative(post.created_at)}
                        </p>
                        {(post.kind === 'offer' || post.kind === 'request') && (() => {
                          const isAuthor = post.author_id === currentUserId;
                          const responders = post.responses ?? [];
                          const iResponded = responders.some(
                            (r) => r.responder_id === currentUserId,
                          );
                          const helpers = responders.map((r) => ({
                            id: r.responder_id,
                            name: memberNames[r.responder_id] ?? 'A neighbor',
                            handle: memberById.get(r.responder_id)?.handle ?? null,
                          }));
                          return (
                            <div className="mt-2 space-y-1.5">
                              {post.expires_at && !post.fulfilled_at && (
                                <p className="text-xs text-ink-faint">
                                  Listed until {formatDate(post.expires_at)}
                                </p>
                              )}
                              {isAuthor && helpers.length > 0 && (
                                <p className="text-xs font-bold text-sage-deep">
                                  Can help:{' '}
                                  {helpers.map((helper, index) => (
                                    <span key={helper.id}>
                                      {index > 0 && ', '}
                                      {helper.handle ? (
                                        // Their profile is where you can reach
                                        // them: connect, or say you're down.
                                        <Link
                                          href={`/u/${encodeURIComponent(helper.handle)}?from=/boards/${slug}`}
                                          className="inline-flex min-h-11 items-center underline underline-offset-2"
                                        >
                                          {helper.name}
                                        </Link>
                                      ) : (
                                        helper.name
                                      )}
                                    </span>
                                  ))}
                                </p>
                              )}
                              <div className="flex items-center gap-2">
                                {post.fulfilled_at ? (
                                  <span className="rounded-pill bg-sage-soft px-2.5 py-1 text-xs font-bold text-sage-deep">
                                    Complete
                                  </span>
                                ) : isAuthor ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startTransition(async () => {
                                        const result = await fulfillBoardPost(post.id, slug);
                                        if (!result.ok) toast.error(result.error ?? 'Could not update it.', result.code);
                                        else router.refresh();
                                      })
                                    }
                                    className="inline-flex min-h-11 items-center rounded-pill border border-line px-3 text-xs font-bold"
                                  >
                                    Mark complete
                                  </button>
                                ) : iResponded ? (
                                  <>
                                    <span className="rounded-pill bg-cream px-2.5 py-1 text-xs font-bold text-ink-soft">
                                      You offered to help
                                    </span>
                                    <button
                                      type="button"
                                      disabled={pending}
                                      onClick={() =>
                                        startTransition(async () => {
                                          const result = await withdrawBoardResponse(post.id, slug);
                                          if (!result.ok) {
                                            toast.error(result.error ?? 'Could not take that back.', result.code);
                                            return;
                                          }
                                          toast.success('Offer withdrawn.');
                                          router.refresh();
                                        })
                                      }
                                      className={`${ACTION_CLASS} text-ink-faint hover:text-rose-deep`}
                                    >
                                      Withdraw
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startTransition(async () => {
                                        const result = await respondToBoardPost(post.id, slug);
                                        if (!result.ok) toast.error(result.error ?? 'Could not respond.', result.code);
                                        else {
                                          toast.success('The neighbor was notified.');
                                          router.refresh();
                                        }
                                      })
                                    }
                                    className="inline-flex min-h-11 items-center rounded-pill bg-terracotta px-3 text-xs font-bold text-white"
                                  >
                                    I can help
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {post.event_id ? (
                          <Link
                            href={`/events/${post.event_id}`}
                            className={`${ACTION_CLASS} bg-sage-soft font-bold text-sage-deep hover:bg-sage/20`}
                          >
                            open the plan
                          </Link>
                        ) : (
                          post.author_id === currentUserId && (
                            <button
                              type="button"
                              onClick={() => makePlan(post.id)}
                              disabled={pending}
                              className={`${ACTION_CLASS} font-semibold text-sage-deep hover:text-sage`}
                            >
                              make it a plan
                            </button>
                          )
                        )}
                        {post.author_id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => flagPost(post.id)}
                            disabled={pending}
                            className={`${ACTION_CLASS} text-ink-faint hover:text-rose-deep`}
                          >
                            report
                          </button>
                        )}
                      </div>
                      {canRemove && (
                        <div className="flex shrink-0 items-center gap-1">
                          {post.author_id === currentUserId && (
                            <button
                              type="button"
                              onClick={() => editPost(post)}
                              disabled={pending}
                              className={`${ACTION_CLASS} font-semibold text-terracotta-deep`}
                            >
                              edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removePost(post.id)}
                            disabled={pending}
                            className={`${ACTION_CLASS} text-ink-faint hover:text-rose-deep`}
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
        {(olderCursor || viewingOlder) && (
          <nav aria-label="More posts" className="mt-3 flex flex-wrap justify-between gap-2">
            {viewingOlder ? (
              <Link href={`/boards/${slug}`} className={`${ACTION_CLASS} font-bold text-terracotta-deep`}>
                ← Newest posts
              </Link>
            ) : (
              <span />
            )}
            {olderCursor && (
              <Link
                href={`/boards/${slug}?before=${encodeURIComponent(olderCursor)}`}
                className={`${ACTION_CLASS} font-bold text-terracotta-deep`}
              >
                Older posts →
              </Link>
            )}
          </nav>
        )}
      </section>

      <BoardMembers
        boardId={boardId}
        slug={slug}
        currentUserId={currentUserId}
        isModerator={isModerator}
        isFounder={isFounder}
        members={members}
      />

      <BoardSettings
        boardId={boardId}
        name={boardName}
        description={boardDescription}
        isModerator={isModerator}
        canDelete={isFounder || (isModerator && !founderPresent)}
        soleModerator={
          isModerator && members.filter((member) => member.role === 'moderator').length === 1
        }
        memberCount={members.length}
      />
    </div>
  );
}
