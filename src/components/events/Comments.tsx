'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VoiceRecorder, type RecordedClip } from '@/components/ui/VoiceRecorder';
import { VoiceNote } from '@/components/ui/VoiceNote';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { postComment, deleteComment } from '@/lib/actions/comments';
import { uploadAudio } from '@/lib/client/upload-audio';
import { formatRelative } from '@/lib/format';

export interface CommentView {
  id: string;
  author_id: string;
  author_name: string;
  body: string | null;
  voice_url: string | null;
  voice_duration_seconds: number | null;
  created_at: string;
}

interface CommentsProps {
  eventId: string;
  currentUserId: string;
  isHost: boolean;
  canPost: boolean;
  comments: CommentView[];
}

/** Two-way conversation under a plan: text, voice notes, or both. */
export function Comments({ eventId, currentUserId, isHost, canPost, comments }: CommentsProps) {
  const [body, setBody] = useState('');
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

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
          voiceUrl = uploaded.url;
          voiceDurationSeconds = uploaded.durationSeconds;
        } catch (uploadError) {
          setError(
            uploadError instanceof Error
              ? uploadError.message
              : 'Could not upload the voice note.',
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

  async function remove(comment: CommentView) {
    const ok = await confirm({
      title: 'Delete this comment?',
      body: 'This removes it for everyone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete that comment.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <section>
      <SectionHeader
        title={comments.length > 0 ? `Comments · ${comments.length}` : 'Comments'}
        hint={canPost ? 'Everyone on the plan can see these' : undefined}
      />

      {canPost && (
        <Card className="mb-3">
          <label htmlFor="comment" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="comment"
            value={body}
            rows={2}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment, question, or hype…"
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft resize-none"
          />
          {error && <p role="alert" className="text-sm text-rose-deep mt-1.5">{error}</p>}
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

      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const canDelete = isHost || comment.author_id === currentUserId;
            return (
              <li key={comment.id} className="rounded-card bg-cream px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={comment.author_name} seed={comment.author_id} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {comment.author_name}
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {formatRelative(comment.created_at)}
                    </span>
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(comment)}
                      disabled={pending}
                      aria-label="Delete comment"
                      className="rounded-pill p-1.5 text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-50"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
                {comment.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {comment.body}
                  </p>
                )}
                {comment.voice_url && (
                  <div className="mt-2">
                    <VoiceNote
                      url={comment.voice_url}
                      durationSeconds={comment.voice_duration_seconds}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !canPost && (
          <p className="text-sm text-ink-faint">No comments yet.</p>
        )
      )}
    </section>
  );
}
