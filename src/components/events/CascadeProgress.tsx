'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { ReorderableList } from '@/components/ui/ReorderableList';
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
  setInviteStage,
  setInviteWindow,
} from '@/lib/actions/events';
import { formatRelative, formatWindow } from '@/lib/format';
import {
  isStaggered,
  orderMatters,
  wavesMatter,
  wavesOffered,
} from '@/lib/invite-rhythm';
import { INVITE_STATUS_LABEL } from '@/lib/invite-status';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { EXTEND_CHOICES, WINDOW_CHOICES } from '@/lib/engine/windows';
import type { Invite, InviteMode } from '@/lib/types';
import type { InviteStatus } from '@/lib/engine/cascade';
import { normalizeInviteStatus } from '@/lib/invite-status';

type HostInvite = Invite & {
  invitee_name: string;
  deliveries?: Array<{
    channel: 'in_app' | 'email' | 'sms';
    status: string;
  }>;
};

interface CascadeProgressProps {
  invites: HostInvite[];
  mode: InviteMode;
  /** Host/co-host view: show per-invite manage controls. */
  eventId?: string;
  editable?: boolean;
  /**
   * Whether an invitation that is already out may be given more time (D17,
   * `hostCanExtendLiveWindow`). Narrower than `editable`: a date poll's line is
   * editable, but nothing in it has gone out.
   */
  canExtend?: boolean;
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
  pending_approval: { className: 'text-gold-deep', dot: 'bg-gold' },
};

const REOPENABLE: ReadonlySet<string> = new Set([
  'expired',
  'declined',
  'cancelled',
]);

/**
 * Delivery outcomes that mean this channel did not, and will not, reach them —
 * the only ones worth a host's alarm. The two sources and their full CHECK sets:
 *
 *   invite_delivery_attempts (20260902120000_sms_opt_outs.sql):
 *     sent, not_configured, invalid_recipient, opted_out, failed
 *   sms_jobs (20260908234728_sms_consent_and_delivery.sql):
 *     pending, sending, accepted, queued, sending_provider, sent, delivered,
 *     undelivered, failed, suppressed, expired, unknown
 *
 * Everything else is in flight or landed. Colouring every status but `sent` red
 * showed an SMS the carrier had confirmed `delivered` as a failure.
 */
const DELIVERY_FAILED: ReadonlySet<string> = new Set([
  'failed',
  'not_configured',
  'invalid_recipient',
  'opted_out',
  'undelivered',
  'suppressed',
  'expired',
]);

const ROW_TONE: Record<string, string> = {
  sent: 'bg-gold-soft shadow-lift',
  accepted: 'bg-sage-soft',
};

/** Host-only live view of how the cascade is flowing, with manage controls. */
export function CascadeProgress({
  invites,
  mode,
  eventId,
  editable,
  canExtend,
  people,
}: CascadeProgressProps) {
  const [pending, startTransition] = useTransition();
  const [openPerson, setOpenPerson] = useState<InviteePerson | null>(null);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  function doRemove(invite: HostInvite) {
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

  function doResend(invite: HostInvite) {
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

  /**
   * Move a queued invite from one place in the line to another.
   *
   * `move_queued_invite` swaps with the adjacent QUEUED invite, deliberately:
   * an invite that has already gone out is history and the database will not
   * let it be rewritten. A drag across three slots is therefore three swaps,
   * issued in order and awaited, rather than one new database function that
   * would have to re-derive the same authorization and the same locking.
   *
   * That makes a long drag several round trips, which is the right trade for a
   * list that is four or five people long and is edited by hand. If one of
   * them fails the rest are abandoned and the page is refreshed, so what is on
   * screen is what the database actually holds — never an optimistic order
   * that was only ever half applied.
   */
  function doMove(from: number, to: number, queued: HostInvite[]) {
    if (!eventId || from === to) return;
    const invite = queued[from];
    startTransition(async () => {
      const up = to < from;
      for (let step = 0; step < Math.abs(to - from); step += 1) {
        const result = await moveQueuedInvite(eventId, invite.id, up);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not reorder the line.', result.code);
          break;
        }
      }
      router.refresh();
    });
  }

  /**
   * Move somebody into another wave.
   *
   * A wave plan's order is which wave, so this is its reorder control: there is
   * no line to drag anybody up, because a whole stage is asked together. Moving
   * someone into a wave that has already gone out asks them on the next sweep,
   * which is the point of it. `set_invite_stage` only touches invites that have
   * not been sent, and bounds the wave to one the plan has (or the one after),
   * so the select cannot offer what the database would refuse.
   */
  function doStage(invite: HostInvite, stage: number) {
    if (!eventId) return;
    startTransition(async () => {
      const result = await setInviteStage(eventId, invite.id, stage);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change their wave.', result.code);
        return;
      }
      router.refresh();
    });
  }

  function doWindow(invite: HostInvite, minutes: number) {
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

  // Which waves this plan has, plus the one after the last. One rule, shared
  // with the wizard's wave dropdown and with `set_invite_stage`.
  const waveChoices = wavesOffered(invites.map((invite) => invite.group_stage));

  /** One row's contents: who it is, where their invitation got to, what is left to do. */
  function row(invite: HostInvite): ReactNode {
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
    const canReWindow = editable && invite.status === 'queued';
    const canGiveMoreTime = Boolean(canExtend) && invite.status === 'sent';
    const canRestage = canReWindow && wavesMatter(mode);
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
    // The person behind this invite, when there is something to do with them —
    // text, email, or hand over their link.
    const person = people?.[invite.id];
    const tappable = person && inviteeIsTappable(person);
    const identity = (
      <>
        <span className={`size-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
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
                invite.deliveries?.some((delivery) => DELIVERY_FAILED.has(delivery.status))
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
      <div className="flex items-center gap-3">
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
        {canRestage && (
          <select
            value={invite.group_stage}
            disabled={pending}
            onChange={(e) => doStage(invite, Number(e.target.value))}
            aria-label={`Wave for ${invite.invitee_name}`}
            className="rounded-pill border border-line bg-paper px-2 py-1 text-xs font-medium text-ink outline-none focus:border-terracotta"
          >
            {/* A row outside the offered range (a plan from before the cap)
                still shows where it is, as the window select does. */}
            {!waveChoices.includes(invite.group_stage) && (
              <option value={invite.group_stage}>
                Wave {invite.group_stage + 1}
              </option>
            )}
            {waveChoices.map((stage) => (
              <option key={stage} value={stage}>
                Wave {stage + 1}
              </option>
            ))}
          </select>
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
        {canGiveMoreTime && (
          <select
            value=""
            disabled={pending}
            onChange={(e) => {
              const add = Number(e.target.value);
              if (add > 0) doWindow(invite, invite.window_minutes + add);
            }}
            aria-label={`Give ${invite.invitee_name} more time to answer`}
            className="rounded-pill border border-line bg-paper px-2 py-1 text-xs font-medium text-ink outline-none focus:border-terracotta"
          >
            <option value="">More time</option>
            {EXTEND_CHOICES.map((choice) => (
              <option key={choice.addMinutes} value={choice.addMinutes}>
                {choice.label}
              </option>
            ))}
          </select>
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
      </div>
    );
  }

  const ordered = [...invites].sort((a, b) => a.position - b.position);
  const stages = mode === 'group'
    ? [...new Set(ordered.map((i) => i.group_stage))].sort((a, b) => a - b)
    : [null];

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const stageInvites =
          stage === null ? ordered : ordered.filter((i) => i.group_stage === stage);
        // Order is a decision only when we ask one person at a time, and only
        // over the people still waiting their turn: an invitation already sent
        // is history, and the database refuses to rewrite it.
        const queued = orderMatters(mode)
          ? stageInvites.filter((i) => i.status === 'queued')
          : [];
        const settled = stageInvites.filter((i) => !queued.includes(i));
        const canDrag = Boolean(editable) && queued.length > 1;
        return (
          <div key={stage ?? 'all'} className="space-y-2">
            {stage !== null && stages.length > 1 && (
              <p className="text-plate text-plate-inset inline-block text-xs font-extrabold uppercase tracking-wide text-terracotta-deep">
                Wave {stage + 1}
              </p>
            )}
            {settled.length > 0 && (
              <ReorderableList
                aria-label="Invitations already out"
                items={settled.map((invite) => ({
                  ...invite,
                  key: invite.id,
                  label: invite.invitee_name,
                }))}
                onRemove={editable ? (item) => doRemove(item) : undefined}
                canRemove={(item) => item.status !== 'accepted'}
                removeLabel={(item) => `Remove ${item.invitee_name}`}
                rowClassName={(item) => ROW_TONE[item.status] ?? 'bg-cream'}
              >
                {(invite) => row(invite)}
              </ReorderableList>
            )}
            {queued.length > 0 && (
              <>
                {canDrag && (
                  <p className="text-plate text-plate-inset inline-block text-xs font-bold text-ink-soft">
                    Still in line - drag anyone by the handle to change who is asked next.
                  </p>
                )}
                {/* The one case where there is a line and nothing to do with
                    it. Saying so beats a row with no handle on it, which is
                    what "unable to reorder people in the queue" looks like. */}
                {editable && queued.length === 1 && (
                  <p className="text-plate text-plate-inset inline-block text-xs font-bold text-ink-soft">
                    Only one person is still in line, so there is nobody to swap
                    them with.
                  </p>
                )}
                <ReorderableList
                  aria-label="Invitations still in line"
                  items={queued.map((invite) => ({
                    ...invite,
                    key: invite.id,
                    label: invite.invitee_name,
                  }))}
                  onReorder={canDrag ? (from, to) => doMove(from, to, queued) : undefined}
                  onRemove={editable ? (item) => doRemove(item) : undefined}
                  removeLabel={(item) => `Remove ${item.invitee_name}`}
                  rowClassName="bg-cream"
                >
                  {(invite) => row(invite)}
                </ReorderableList>
              </>
            )}
          </div>
        );
      })}
      {/* A wave plan's order is which wave, and the control for it is on the
          row. Without this the section reads as a list you cannot change. */}
      {editable && wavesMatter(mode) && invites.some((i) => i.status === 'queued') && (
        <p className="text-plate text-plate-inset text-xs leading-relaxed text-ink-soft">
          Waves go out in order, so the order here is which wave. Move anyone
          still waiting into an earlier wave to ask them sooner - a wave that has
          already gone out asks them within the minute.
        </p>
      )}
      <p className="text-plate text-plate-inset text-xs leading-relaxed text-ink-faint">
        {isStaggered(mode)
          ? ''
          : 'Everyone on this list was invited at the same moment - there is no line and nobody is waiting a turn. '}
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
