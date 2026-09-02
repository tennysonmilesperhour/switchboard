'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { VoiceRecorder, type RecordedClip } from '@/components/ui/VoiceRecorder';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  cancelEvent,
  confirmEvent,
  deleteEventPermanently,
  markHappened,
  startInviting,
} from '@/lib/actions/events';
import { uploadAudio } from '@/lib/client/upload-audio';
import type { SwitchboardEvent } from '@/lib/types';

interface HostControlsProps {
  event: SwitchboardEvent;
  pollDecided: boolean;
  isPrimaryHost: boolean;
}

export function HostControls({ event, pollDecided, isPrimaryHost }: HostControlsProps) {
  const [pending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function resetCancel() {
    setCancelling(false);
    setReason('');
    setClip(null);
  }

  function confirmCancel() {
    startTransition(async () => {
      let voiceUrl: string | undefined;
      if (clip) {
        try {
          const uploaded = await uploadAudio(clip.blob, clip.durationSeconds);
          voiceUrl = uploaded.path;
        } catch (uploadError) {
          toast.error(
            uploadError instanceof Error ? uploadError.message : 'Could not upload the voice note.',
          );
          return;
        }
      }
      await cancelEvent(event.id, reason.trim() || undefined, voiceUrl);
      resetCancel();
      router.refresh();
    });
  }

  async function deletePlan() {
    const approved = await confirm({
      title: `Permanently delete “${event.title}”?`,
      body:
        'This removes the plan, invitations, polls, comments, room messages, and invite links. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (!approved) return;
    startTransition(async () => {
      const result = await deleteEventPermanently(event.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete this plan.', result.code);
        return;
      }
      toast.success('Plan permanently deleted.');
      router.replace('/plans');
      router.refresh();
    });
  }

  const isClosed = event.status === 'cancelled' || event.status === 'past';

  const elapsed = !!event.starts_at && new Date(event.starts_at) < new Date();

  return (
    <section className="border-t border-line pt-6 space-y-2.5">
      {!isClosed && (elapsed ? (
        <Button
          variant="accept"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => run(() => markHappened(event.id))}
        >
          Mark it happened 🎉
        </Button>
      ) : (
        <>
          {event.status === 'deciding' && (
            <Button
              size="lg"
              className="w-full"
              disabled={pending || !pollDecided}
              onClick={() => run(() => startInviting(event.id))}
            >
              {pollDecided
                ? 'Send the invitations 🪜'
                : 'Waiting for the group to decide…'}
            </Button>
          )}
          {event.status === 'inviting' && (
            <Button
              variant="accept"
              size="lg"
              className="w-full"
              disabled={pending}
              onClick={() => run(() => confirmEvent(event.id))}
            >
              Lock it in - confirm the plan ✓
            </Button>
          )}
        </>
      ))}

      {!isClosed && (cancelling ? (
        <Card tone="terracotta" className="space-y-2.5">
          <div>
            <p className="text-sm font-bold text-ink">Cancel this plan?</p>
            <p className="text-xs text-ink-soft mt-0.5">
              Everyone who’s in will be notified. Add a reason so they know why - type it,
              record a voice note, or both. All optional.
            </p>
          </div>
          <label htmlFor="cancel-reason" className="sr-only">
            Reason for cancelling
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            rows={2}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Weather’s turning, let’s reschedule…"
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft resize-none"
          />
          <VoiceRecorder value={clip} onChange={setClip} disabled={pending} />
          <div className="flex gap-2 pt-0.5">
            <Button
              variant="danger"
              className="flex-1"
              disabled={pending}
              onClick={confirmCancel}
            >
              {pending ? 'Cancelling…' : 'Call it off'}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={resetCancel}>
              Never mind
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => setCancelling(true)}
        >
          Cancel this plan
        </Button>
      ))}

      {isPrimaryHost && (
        <Button
          variant="danger"
          className="w-full"
          disabled={pending}
          onClick={deletePlan}
        >
          {pending ? 'Deleting…' : 'Delete permanently'}
        </Button>
      )}
    </section>
  );
}
