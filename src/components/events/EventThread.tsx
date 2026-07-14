'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { VoiceRecorder, type RecordedClip } from '@/components/ui/VoiceRecorder';
import { VoiceNote } from '@/components/ui/VoiceNote';
import { postComment, deleteComment } from '@/lib/actions/event-thread';
import { uploadAudio } from '@/lib/client/upload-audio';
import { formatRelative } from '@/lib/format';

export interface ThreadCommentView {
  id: string;
  body: string | null;
  voice_url: string | null;
  voice_duration_seconds: number | null;
  created_at: string;
  author_id: string;
  author_name: string;
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
}: EventThreadProps) {
  const [body, setBody] = useState('');
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function send() {
    const trimmed = body.trim();
    if (!trimmed && !clip) return;
    setError('');
    startTransition(async () => {
      let voiceUrl: string | undefined;
      let voiceDurationSeconds: number | undefined;
      if (clip) {
        try {
          const uploaded = await uploadAudio(clip.blob, clip.durationSeconds);
          voiceUrl = uploaded.path;
          voiceDurationSeconds = uploaded.durationSeconds;
        } catch (uploadError) {
          setError(
            uploadError instanceof Error ? uploadError.message : 'Could not upload the voice note.',
          );
          return;
        }
      }
      const result = await postComment(eventId, {
        body: trimmed || undefined,
        voiceUrl,
        voiceDurationSeconds,
      });
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong');
        return;
      }
      setBody('');
      setClip(null);
      router.refresh();
    });
  }

  function remove(commentId: string) {
    startTransition(async () => {
      const result = await deleteComment(eventId, commentId);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong');
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
          <label htmlFor="event-comment" className="sr-only">
            Add to the thread
          </label>
          <textarea
            id="event-comment"
            value={body}
            rows={2}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Say something to the group…"
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft resize-none"
          />
          {error && (
            <p role="alert" className="text-sm text-rose-deep mt-1.5">
              {error}
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
                    {(mine || canModerate) && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(comment.id)}
                        className="text-xs text-ink-faint hover:text-rose-deep mt-1.5 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    )}
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
                🔒 {hiddenCount} more{' '}
                {hiddenCount === 1 ? 'comment' : 'comments'} in the thread
              </p>
              <p className="text-sm text-ink-soft mt-0.5">
                RSVP to read the whole conversation and add your take.
              </p>
              <Link
                href={`#rsvp-${eventId}`}
                className="inline-flex items-center justify-center gap-2 rounded-btn font-bold mt-3 px-4 py-2 text-sm bg-terracotta text-white hover:bg-terracotta-deep transition-colors"
              >
                RSVP to unlock
              </Link>
            </Card>
          </div>
        </div>
      )}

      {/* Locked with nothing yet hidden: a quiet invitation. */}
      {!unlocked && hiddenCount === 0 && !hasPreview && (
        <Card tone="gold" className="text-center">
          <p className="text-sm text-ink-soft">
            RSVP to join the thread and add your take.
          </p>
        </Card>
      )}
    </section>
  );
}
