'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  InviteeSheet,
  inviteeIsTappable,
  type InviteePerson,
} from '@/components/events/InviteeSheet';
import {
  moveQueuedInvite,
  removeInvite,
  resendInvite,
  setInviteWindow,
} from '@/lib/actions/events';
import { formatRelative, formatWindow } from '@/lib/format';
import { INVITE_STATUS_LABEL } from '@/lib/invite-status';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { WINDOW_CHOICES } from '@/lib/engine/windows';
import type { Invite } from '@/lib/types';
import type { InviteStatus } from '@/lib/engine/cascade';
import { normalizeInviteStatus } from '@/lib/invite-status';

interface CascadeProgressProps {
  invites: Array<
    Invite & {
      invitee_name: string;
      deliveries?: Array<{
        channel: 'in_app' | 'email' | 'sms';
        status: string;
      }>;
    }
  >;
  mode: string;
  /** Host/co-host view: show per-invite manage controls. */
  eventId?: string;
  editable?: boolean;
  /**
   * Contact cards keyed by invite id. Tapping a row opens the person's card,
   * which is how a host reaches an invitee who has no account (see
   * `InviteeSheet`). Absent means the rows stay read-only.
   */
  people?: Record<string, InviteePerson>;
}

// Colour and motion per status; the wording itself comes from the shared label
// map so this row and the contact card it opens never disagree.
const STATUS_STYLE: Record<InviteStatus, { className: string; dot: string }> = {
  queued: { className: 'text-ink-faint', dot: 'bg-line' },
  sent: { className: 'text-gold-deep', dot: 'bg-gold animate-pulse-soft' },
  accepted: { className: 'text-sage-deep', dot: 'bg-sage' },
  declined: { className: 'text-ink-faint', dot: 'bg-rose-deep/50' },
  expired: { className: 'text-ink-faint', dot: 'bg-line' },
  cancelled: { className: 'text-ink-faint', dot: 'bg-line' },
  waitlisted: { className: 'text-gold-deep', dot: 'bg-gold' },
  requested: { className: 'text-terracotta-deep', dot: 'bg-terracotta' },
};

const REOPENABLE: ReadonlySet<string> = new Set([
  'expired',
  'declined',
  'cancelled',
]);

/** Host-only live view of how the cascade is flowing, with manage controls. */
export function CascadeProgress({
  invites,
  mode,
  eventId,
  editable,
  people,
}: CascadeProgressProps) {
  const [pending, startTransition] = useTransition();
  const [openPerson, setOpenPerson] = useState<InviteePerson | null>(null);
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
        toast.error(result.error ?? 'Could not remove that invite.', result.code);
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
        toast.error(result.error ?? 'Could not resend that invite.', result.code);
        return;
      }
      if (result.warning) {
        toast.error(`${result.warning} Check the delivery status.`);
        router.refresh();
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
        toast.error(result.error ?? 'Could not reorder the line.', result.code);
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
        toast.error(result.error ?? 'Could not change the window.', result.code);
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
                const status = normalizeInviteStatus(invite.status);
                const style = STATUS_STYLE[status];
                const statusLabel = INVITE_STATUS_LABEL[status];
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
                const deliveryText = invite.deliveries
                  ?.map((delivery) => {
                    const channel = delivery.channel === 'in_app'
                      ? 'in-app'
                      : delivery.channel;
                    if (channel === 'sms') {
                      const labels: Record<string, string> = { pending: 'SMS waiting', sending: 'SMS submitting', accepted: 'SMS accepted by Twilio', queued: 'SMS queued by Twilio', sending_provider: 'SMS sending', sent: 'SMS sent; delivery unconfirmed', delivered: 'SMS delivered', undelivered: 'SMS undelivered', unknown: 'SMS outcome unknown', expired: 'SMS expired', suppressed: 'SMS suppressed', opted_out: 'SMS not subscribed' };
                      if (labels[delivery.status]) return labels[delivery.status];
                    }
                    if (delivery.status === 'sent') return `${channel} sent`;
                    if (delivery.status === 'not_configured') return `${channel} not configured`;
                    if (delivery.status === 'invalid_recipient') return `${channel} address invalid`;
                    if (delivery.status === 'opted_out') return `${channel} opted out`;
                    return `${channel} failed`;
                  })
                  .join(' · ');
                // The person behind this invite, when there is something to do
                // with them — text, email, or hand over their link.
                const person = people?.[invite.id];
                const tappable = person && inviteeIsTappable(person);
                const identity = (
                  <>
                    <Avatar
                      name={invite.invitee_name}
                      seed={invite.invitee_id ?? invite.id}
                      src={person?.avatarUrl}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-bold">
                        {invite.invitee_name}
                        {!invite.invitee_id && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-faint">guest</span>
                        )}
                      </span>
                      <span className={`text-xs ${style.className}`}>
                        {statusLabel}
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
                      {deliveryText && (
                        <span
                          className={`mt-0.5 block text-[11px] ${
                            invite.deliveries?.some((delivery) => delivery.status !== 'sent')
                              ? 'text-rose-deep'
                              : 'text-ink-faint'
                          }`}
                        >
                          {deliveryText}
                        </span>
                      )}
                      {invite.status === 'declined' && invite.decline_message && (
                        <span className="mt-1 block rounded-md bg-paper/70 px-2 py-1 text-xs italic text-ink-soft">
                          “{invite.decline_message}”
                        </span>
                      )}
                    </span>
                  </>
                );
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
                    <span className={`size-2.5 rounded-full shrink-0 ${style.dot}`} aria-hidden />
                    {tappable ? (
                      <button
                        type="button"
                        onClick={() => setOpenPerson(person)}
                        aria-label={`Contact ${invite.invitee_name}`}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-card text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        {identity}
                      </button>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-center gap-3">{identity}</span>
                    )}
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
        {people
          ? 'Tap anyone to text or email them. Invitees never see this view - or their place in line.'
          : 'Invitees never see this view - or their place in line.'}
      </p>
      {openPerson && (
        <InviteeSheet person={openPerson} onClose={() => setOpenPerson(null)} />
      )}
    </div>
  );
}
