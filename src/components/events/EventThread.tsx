'use client';

import { Glyph } from '@/components/ui/Glyph';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { VoiceRecorder, type RecordedClip } from '@/components/ui/VoiceRecorder';
import { VoiceNote } from '@/components/ui/VoiceNote';
import { postComment, deleteComment } from '@/lib/actions/event-thread';
import { UploadError, uploadAudio } from '@/lib/client/upload-audio';
import { errorRef, type ErrorCode } from '@/lib/errors';
import { formatRelative } from '@/lib/format';

export interface ThreadCommentView {
  id: string;
  body: string | null;
  voice_url: string | null;
  voice_duration_seconds: number | null;
  created_at: string;
  author_id: string;
  author_name: string;
  /** The message this one answers: who wrote it and a few of its words. */
  reply_to: { author_name: string; excerpt: string | null } | null;
}

interface EventThreadProps {
  eventId: string;
  /** Viewer has RSVP'd / hosts — reads all and can post. */
  unlocked: boolean;
  /** Viewer can moderate (host / co-host): may remove any comment. */
  canModerate: boolean;
  currentUserId: string;
  /** All comments when unlocked; only the opening preview when locked. */
  comments: ThreadCommentView[];
  /** Real comments hidden behind the blur (locked viewers only). */
  hiddenCount: number;
  /** Placeholder rows to draw under the preview (locked viewers only). */
  blurRows: number;
  /**
   * The id of this page's RSVP card, or null when there isn't one. Only an
   * invitation still waiting on an answer gets that card, so a waitlisted,
   * declined, expired, or uninvited viewer has nothing to jump to — and an
   * "RSVP to unlock" button that scrolls nowhere is a dead end.
   */
  rsvpAnchorId: string | null;
}

/**
 * The event thread. RSVP'd guests (and hosts) see the whole conversation and
 * can add to it; everyone else gets the opening messages, then a soft blur that
 * deepens as it goes down — a nudge to RSVP, not a slammed door.
 */
export function EventThread({
  eventId,
  unlocked,
  canModerate,
  currentUserId,
  comments,
  hiddenCount,
  blurRows,
  rsvpAnchorId,
}: EventThreadProps) {
  const [body, setBody] = useState('');
  const [clip, setClip] = useState<RecordedClip | null>(null);
  // The message being answered. Chosen with a Reply button; shown as a quote
  // above the box so the writer can see what they are replying to.
  const [replyTo, setReplyTo] = useState<ThreadCommentView | null>(null);
  const [error, setError] = useState<{ message: string; code?: ErrorCode } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  function startReply(comment: ThreadCommentView) {
    setReplyTo(comment);
    setError(null);
    // Bring the box to the reader and put the cursor in it: the composer sits
    // above the list, so a tap on Reply far down would otherwise change
    // nothing on screen.
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      composerRef.current?.focus();
    });
  }

  function send() {
    const trimmed = body.trim();
    if (!trimmed && !clip) return;
    setError(null);
    startTransition(async () => {
      let voiceUrl: string | undefined;
      let voiceDurationSeconds: number | undefined;
      if (clip) {
        try {
          const uploaded = await uploadAudio(clip.blob, clip.durationSeconds);
          voiceUrl = uploaded.path;
          voiceDurationSeconds = uploaded.durationSeconds;
        } catch (uploadError) {
          setError({
            message:
              uploadError instanceof Error ? uploadError.message : 'Could not upload the voice note.',
            code: uploadError instanceof UploadError ? uploadError.code : undefined,
          });
          return;
        }
      }
      const result = await postComment(eventId, {
        body: trimmed || undefined,
        voiceUrl,
        voiceDurationSeconds,
        replyToId: replyTo?.id ?? null,
      });
      if (!result.ok) {
        setError({ message: result.error ?? 'Something went wrong', code: result.code });
        return;
      }
      setBody('');
      setClip(null);
      setReplyTo(null);
      router.refresh();
    });
  }

  function remove(commentId: string) {
    startTransition(async () => {
      const result = await deleteComment(eventId, commentId);
      if (!result.ok) {
        setError({ message: result.error ?? 'Something went wrong', code: result.code });
        return;
      }
      router.refresh();
    });
  }

  const hasPreview = comments.length > 0;

  return (
    <section>
      <SectionHeader
        title="Thread"
        hint={unlocked ? 'Everyone who’s in can chime in' : undefined}
      />

      {unlocked && (
        <Card className="mb-3">
          {replyTo && (
            <div className="mb-2 flex items-start justify-between gap-2 rounded-card border-l-4 border-terracotta bg-cream px-3 py-2">
              <p className="min-w-0 text-xs text-ink-soft">
                <span className="font-bold text-ink">Replying to {replyTo.author_name}</span>
                {replyTo.body || replyTo.voice_url ? (
                  <span className="block truncate">
                    {replyTo.body
                      ? replyTo.body.length > 90
                        ? `${replyTo.body.slice(0, 89)}…`
                        : replyTo.body
                      : 'Voice note'}
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="shrink-0 text-xs text-ink-faint hover:text-ink"
              >
                <Glyph emoji="✕" size={14} />
              </button>
            </div>
          )}
          <label htmlFor="event-comment" className="sr-only">
            {replyTo ? `Reply to ${replyTo.author_name}` : 'Add to the thread'}
          </label>
          <textarea
            id="event-comment"
            ref={composerRef}
            value={body}
            rows={2}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            placeholder={replyTo ? `Reply to ${replyTo.author_name}…` : 'Say something to the group…'}
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft resize-none"
          />
          {error && (
            <p role="alert" className="text-sm text-rose-deep mt-1.5">
              {error.message}
              {error.code && (
                <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide opacity-70">
                  {errorRef(error.code)}
                </span>
              )}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <VoiceRecorder value={clip} onChange={setClip} disabled={pending} />
            <Button
              type="button"
              size="sm"
              disabled={pending || (body.trim().length === 0 && !clip)}
              onClick={send}
            >
              {pending ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </Card>
      )}

      {!hasPreview && unlocked && (
        <p className="text-sm text-ink-faint">
          No comments yet - start the conversation.
        </p>
      )}

      {hasPreview && (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const mine = comment.author_id === currentUserId;
            return (
              <li key={comment.id} className="rounded-card bg-cream px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <Avatar
                    name={comment.author_name}
                    seed={comment.author_id}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-ink truncate">
                        {comment.author_name}
                      </p>
                      <span className="text-xs text-ink-faint shrink-0">
                        {formatRelative(comment.created_at)}
                      </span>
                    </div>
                    {comment.reply_to && (
                      <p className="mt-1 rounded-card border-l-2 border-line bg-paper/70 px-2.5 py-1.5 text-xs text-ink-soft">
                        <span className="font-bold">{comment.reply_to.author_name}</span>
                        {comment.reply_to.excerpt && (
                          <span className="block truncate">{comment.reply_to.excerpt}</span>
                        )}
                      </p>
                    )}
                    {comment.body && (
                      <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed mt-0.5">
                        {comment.body}
                      </p>
                    )}
                    {comment.voice_url && (
                      <div className="mt-1.5">
                        <VoiceNote
                          url={comment.voice_url}
                          durationSeconds={comment.voice_duration_seconds}
                        />
                      </div>
                    )}
                    <div className="mt-1.5 flex gap-3">
                      {unlocked && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => startReply(comment)}
                          aria-label={`Reply to ${comment.author_name}`}
                          className="text-xs font-bold text-ink-faint hover:text-terracotta-deep disabled:opacity-40"
                        >
                          Reply
                        </button>
                      )}
                      {(mine || canModerate) && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(comment.id)}
                          className="text-xs text-ink-faint hover:text-rose-deep disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Locked: the conversation fades out beneath the preview. */}
      {!unlocked && hiddenCount > 0 && (
        <div className="relative mt-2">
          <ul aria-hidden="true" className="space-y-2 select-none">
            {Array.from({ length: blurRows }).map((_, i) => (
              <li
                key={i}
                className="rounded-card bg-cream px-3.5 py-3"
                style={{
                  filter: `blur(${2 + i * 2}px)`,
                  opacity: Math.max(0.15, 0.6 - i * 0.15),
                }}
              >
                <div className="flex items-start gap-2.5">
                  <div className="size-8 rounded-full bg-ink/10 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                    <div className="h-2.5 w-24 rounded-pill bg-ink/10" />
                    <div className="h-2.5 w-full rounded-pill bg-ink/10" />
                    <div className="h-2.5 w-3/4 rounded-pill bg-ink/10" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-1">
            <Card tone="gold" lifted className="text-center max-w-sm">
              <p className="font-extrabold text-ink">
                <Glyph emoji="🔒" size={14} className="inline -mt-0.5 mr-1" />{hiddenCount} more{' '}
                {hiddenCount === 1 ? 'comment' : 'comments'} in the thread
              </p>
              {rsvpAnchorId ? (
                <>
                  <p className="text-sm text-ink-soft mt-0.5">
                    RSVP to read the whole conversation and add your take.
                  </p>
                  <Link
                    href={`#${rsvpAnchorId}`}
                    className="inline-flex items-center justify-center gap-2 rounded-btn font-bold mt-3 px-4 py-2 text-sm bg-terracotta text-white hover:bg-terracotta-deep transition-colors"
                  >
                    RSVP to unlock
                  </Link>
                </>
              ) : (
                <p className="text-sm text-ink-soft mt-0.5">
                  The whole conversation is open to everyone who’s going.
                </p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Locked with nothing yet hidden: a quiet invitation. */}
      {!unlocked && hiddenCount === 0 && !hasPreview && (
        <Card tone="gold" className="text-center">
          <p className="text-sm text-ink-soft">
            {rsvpAnchorId
              ? 'RSVP to join the thread and add your take.'
              : 'The thread opens to everyone who’s going.'}
          </p>
        </Card>
      )}
    </section>
  );
}
