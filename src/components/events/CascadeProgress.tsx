'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  moveQueuedInvite,
  removeInvite,
  resendInvite,
  setInviteWindow,
} from '@/lib/actions/events';
import { formatRelative, formatWindow } from '@/lib/format';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { WINDOW_CHOICES } from '@/lib/engine/windows';
import type { Invite } from '@/lib/types';

interface CascadeProgressProps {
  invites: Array<Invite & { invitee_name: string }>;
  mode: 'individual' | 'group' | 'all_at_once';
  /** Host/co-host view: show per-invite manage controls. */
  eventId?: string;
  editable?: boolean;
}

const STATUS_META: Record<
  Invite['status'],
  { label: string; className: string; dot: string }
> = {
  queued: { label: 'Waiting in line', className: 'text-ink-faint', dot: 'bg-line' },
  sent: { label: 'Invited - waiting', className: 'text-gold-deep', dot: 'bg-gold animate-pulse-soft' },
  accepted: { label: 'Accepted', className: 'text-sage-deep', dot: 'bg-sage' },
  declined: { label: 'Declined', className: 'text-ink-faint', dot: 'bg-rose-deep/50' },
  expired: { label: 'No response', className: 'text-ink-faint', dot: 'bg-line' },
  cancelled: { label: 'Not needed', className: 'text-ink-faint', dot: 'bg-line' },
  waitlisted: { label: 'Waitlisted', className: 'text-gold-deep', dot: 'bg-gold' },
  requested: { label: 'Asked to join', className: 'text-terracotta-deep', dot: 'bg-terracotta' },
};

const REOPENABLE: ReadonlySet<Invite['status']> = new Set([
  'expired',
  'declined',
  'cancelled',
]);

/** Host-only live view of how the cascade is flowing, with manage controls. */
export function CascadeProgress({ invites, mode, eventId, editable }: CascadeProgressProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  function doRemove(invite: Invite & { invitee_name: string }) {
    if (!eventId) return;
    startTransition(async () => {
      const live = invite.status === 'sent' || invite.status === 'queued';
      const ok = await confirm({
        title: `Remove ${invite.invitee_name}?`,
        body: live
          ? 'They’ll be taken out of the invitation flow.'
          : 'This clears them from the flow. You can always add them again.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      const result = await removeInvite(eventId, invite.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove that invite.');
        return;
      }
      router.refresh();
    });
  }

  function doResend(invite: Invite & { invitee_name: string }) {
    if (!eventId) return;
    startTransition(async () => {
      const result = await resendInvite(eventId, invite.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not resend that invite.');
        return;
      }
      toast.success(`${invite.invitee_name} is back in the flow.`);
      router.refresh();
    });
  }

  function doMove(invite: Invite & { invitee_name: string }, up: boolean) {
    if (!eventId) return;
    startTransition(async () => {
      const result = await moveQueuedInvite(eventId, invite.id, up);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not reorder the line.');
        return;
      }
      router.refresh();
    });
  }

  function doWindow(invite: Invite & { invitee_name: string }, minutes: number) {
    if (!eventId) return;
    startTransition(async () => {
      const result = await setInviteWindow(eventId, invite.id, minutes);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change the window.');
        return;
      }
      router.refresh();
    });
  }

  const ordered = [...invites].sort((a, b) => a.position - b.position);
  // Queued invites, in line order — used to know who can move up/down.
  const queuedIds = ordered.filter((i) => i.status === 'queued').map((i) => i.id);
  const stages = mode === 'group'
    ? [...new Set(ordered.map((i) => i.group_stage))].sort((a, b) => a - b)
    : [null];

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const stageInvites =
          stage === null ? ordered : ordered.filter((i) => i.group_stage === stage);
        return (
          <div key={stage ?? 'all'}>
            {stage !== null && stages.length > 1 && (
              <p className="text-xs font-extrabold uppercase tracking-wide text-terracotta-deep mb-2">
                Wave {stage + 1}
              </p>
            )}
            <ol className="space-y-1.5">
              {stageInvites.map((invite) => {
                const meta = STATUS_META[invite.status];
                const expiresAt =
                  invite.status === 'sent'
                    ? inviteExpiresAt({
                        id: invite.id,
                        position: invite.position,
                        groupStage: invite.group_stage,
                        status: invite.status,
                        windowMinutes: invite.window_minutes,
                        sentAt: invite.sent_at,
                      })
                    : null;
                const canResend = editable && REOPENABLE.has(invite.status);
                const canRemove = editable && invite.status !== 'accepted';
                const isQueued = invite.status === 'queued';
                const queuedIndex = queuedIds.indexOf(invite.id);
                // Order only matters when we ask one at a time.
                const canMove =
                  editable && isQueued && mode === 'individual' && queuedIds.length > 1;
                const canReWindow = editable && isQueued;
                return (
                  <li
                    key={invite.id}
                    className={`flex items-center gap-3 rounded-card px-3.5 py-3 ${
                      invite.status === 'sent'
                        ? 'bg-gold-soft shadow-lift'
                        : invite.status === 'accepted'
                          ? 'bg-sage-soft'
                          : 'bg-cream'
                    }`}
                  >
                    <span className={`size-2.5 rounded-full shrink-0 ${meta.dot}`} aria-hidden />
                    <Avatar name={invite.invitee_name} seed={invite.invitee_id ?? invite.id} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-bold block truncate">
                        {invite.invitee_name}
                        {!invite.invitee_id && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-faint">guest</span>
                        )}
                      </span>
                      <span className={`text-xs ${meta.className}`}>
                        {meta.label}
                        {invite.status === 'sent' && expiresAt
                          ? ` · moves on ${formatRelative(expiresAt.toISOString())}`
                          : ''}
                        {invite.status === 'queued'
                          ? ` · ${formatWindow(invite.window_minutes)} window`
                          : ''}
                        {invite.status === 'declined' && invite.decline_note === 'keep_asking'
                          ? ' · “ask me again!”'
                          : ''}
                      </span>
                    </span>
                    {canReWindow && (
                      <select
                        value={invite.window_minutes}
                        disabled={pending}
                        onChange={(e) => doWindow(invite, Number(e.target.value))}
                        aria-label={`Response window for ${invite.invitee_name}`}
                        className="rounded-pill border border-line bg-paper px-2 py-1 text-xs font-medium text-ink outline-none focus:border-terracotta"
                      >
                        {!WINDOW_CHOICES.some(
                          (c) => c.windowMinutes === invite.window_minutes,
                        ) && (
                          <option value={invite.window_minutes}>
                            {formatWindow(invite.window_minutes)}
                          </option>
                        )}
                        {WINDOW_CHOICES.map((c) => (
                          <option key={c.windowMinutes} value={c.windowMinutes}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {canMove && (
                      <span className="flex flex-col leading-none">
                        <button
                          type="button"
                          disabled={pending || queuedIndex === 0}
                          onClick={() => doMove(invite, true)}
                          aria-label={`Move ${invite.invitee_name} earlier`}
                          className="px-1 text-ink-faint hover:text-ink disabled:opacity-25"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={pending || queuedIndex === queuedIds.length - 1}
                          onClick={() => doMove(invite, false)}
                          aria-label={`Move ${invite.invitee_name} later`}
                          className="px-1 text-ink-faint hover:text-ink disabled:opacity-25"
                        >
                          ▼
                        </button>
                      </span>
                    )}
                    {canResend && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => doResend(invite)}
                        className="rounded-pill px-2 py-1 text-xs font-semibold text-terracotta-deep hover:bg-terracotta-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        Resend
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => doRemove(invite)}
                        aria-label={`Remove ${invite.invitee_name}`}
                        className="rounded-pill px-2 py-1 text-xs font-semibold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      <p className="text-xs text-ink-faint leading-relaxed">
        Invitees never see this view - or their place in line.
      </p>
    </div>
  );
}
