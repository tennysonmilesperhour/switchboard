'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
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
import { UploadError, uploadAudio } from '@/lib/client/upload-audio';
import { hostCanEditInvitees } from '@/lib/share-link';
import { invitationStep } from '@/lib/poll-readiness';
import type { ActionResult } from '@/lib/errors';
import type { SwitchboardEvent } from '@/lib/types';

interface HostControlsProps {
  event: SwitchboardEvent;
  /**
   * The polls' half of the send rule: nothing is still being answered
   * (`readyToSendInvitations`). Combined here with the plan's date through
   * `invitationStep`, the same composition `startInviting` enforces.
   */
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

  // Refresh either way: after a refusal the page should show where the plan
  // actually stands, which is usually the explanation.
  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? 'That didn’t go through. Reload and try again.', result.code);
      }
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
            uploadError instanceof UploadError ? uploadError.code : undefined,
          );
          return;
        }
      }
      const result = await cancelEvent(event.id, reason.trim() || undefined, voiceUrl);
      if (!result.ok) {
        // Keep what they wrote, so a retry doesn't mean typing it again.
        toast.error(result.error ?? 'Could not cancel this plan.', result.code);
        router.refresh();
        return;
      }
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
  const sendStep = invitationStep(pollDecided, event.starts_at);

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
          Mark it happened
        </Button>
      ) : (
        <>
          {event.status === 'deciding' && sendStep === 'needs-date' && (
            // The group is done, but nothing it decided is a time: a free-text
            // idea won, nobody picked, or the poll closed empty. A disabled
            // button here was a dead end; the date is the host's to set.
            <div className="space-y-1.5">
              <Link
                href={`/events/${event.id}/edit#startsAt`}
                className="flex w-full items-center justify-center gap-2 rounded-btn bg-brand-gradient px-7 py-4 text-base font-bold text-white shadow-lift outline-none transition-all duration-150 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.98]"
              >
                Set the date
              </Link>
              <p className="text-plate text-plate-inset text-center text-xs text-ink-soft">
                The group has decided, but the plan has no date yet. Set one and the invitations can go out.
              </p>
            </div>
          )}
          {event.status === 'deciding' && sendStep !== 'needs-date' && (
            <Button
              size="lg"
              className="w-full"
              disabled={pending || sendStep !== 'ready'}
              onClick={() => run(() => startInviting(event.id))}
            >
              {sendStep === 'ready'
                ? 'Send the invitations'
                : 'Waiting for the group to decide…'}
            </Button>
          )}
          {hostCanEditInvitees(event.status) && (
            <Button
              variant="accept"
              size="lg"
              className="w-full"
              disabled={pending}
              onClick={() => run(() => confirmEvent(event.id))}
            >
              Lock it in - confirm the plan
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
