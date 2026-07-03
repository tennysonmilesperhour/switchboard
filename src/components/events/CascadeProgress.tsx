import { Avatar } from '@/components/ui/Avatar';
import { formatRelative, formatWindow } from '@/lib/format';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import type { Invite } from '@/lib/types';

interface CascadeProgressProps {
  invites: Array<Invite & { invitee_name: string }>;
  mode: 'individual' | 'group' | 'all_at_once';
}

const STATUS_META: Record<
  Invite['status'],
  { label: string; className: string; dot: string }
> = {
  queued: { label: 'Waiting in line', className: 'text-ink-faint', dot: 'bg-line' },
  sent: { label: 'Invited — waiting', className: 'text-gold', dot: 'bg-gold animate-pulse-soft' },
  accepted: { label: 'Accepted', className: 'text-sage-deep', dot: 'bg-sage' },
  declined: { label: 'Declined', className: 'text-ink-faint', dot: 'bg-rose-deep/50' },
  expired: { label: 'No response', className: 'text-ink-faint', dot: 'bg-line' },
  cancelled: { label: 'Not needed', className: 'text-ink-faint', dot: 'bg-line' },
  waitlisted: { label: 'Waitlisted', className: 'text-gold', dot: 'bg-gold-soft' },
};

/** Host-only live view of how the cascade is flowing. */
export function CascadeProgress({ invites, mode }: CascadeProgressProps) {
  const ordered = [...invites].sort((a, b) => a.position - b.position);
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
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint mb-2">
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
                return (
                  <li
                    key={invite.id}
                    className={`flex items-center gap-3 rounded-card px-3.5 py-2.5 ${
                      invite.status === 'sent'
                        ? 'bg-gold-soft'
                        : invite.status === 'accepted'
                          ? 'bg-sage-soft'
                          : 'bg-cream'
                    }`}
                  >
                    <span className={`size-2 rounded-full shrink-0 ${meta.dot}`} aria-hidden />
                    <Avatar name={invite.invitee_name} seed={invite.invitee_id ?? invite.id} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">
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
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      <p className="text-xs text-ink-faint leading-relaxed">
        Invitees never see this view — or their place in line.
      </p>
    </div>
  );
}
