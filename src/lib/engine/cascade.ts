/**
 * Cascade state machine - pure, server-authoritative invite advancement.
 *
 * Individual mode: one live invite at a time, by position, until spots fill.
 * Group mode: whole stages go out together; the next stage is sent only when
 * the current stage is fully resolved and spots remain.
 */

export type InviteStatus =
  | 'queued'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'waitlisted'
  /** Open-table join request awaiting host approval. */
  | 'requested'
  /**
   * A yes on a guardian-approval plan, held until a guardian approves it
   * (20260930011000_guardian_hold.sql). It is not `accepted`, so it takes no
   * seat in `spotsRemaining`; it is not `sent`, so it neither blocks the line
   * nor expires; and it is not retired when the plan fills — the guardian's
   * answer decides it, re-checking capacity then.
   */
  | 'pending_approval';

export interface CascadeInvite {
  id: string;
  /** Rank order chosen by the host (0-based, unique). */
  position: number;
  /** Stage for group mode (0-based). Individual mode ignores this. */
  groupStage: number;
  status: InviteStatus;
  /** Minutes the invitee has to respond once sent. */
  windowMinutes: number;
  /** ISO timestamp of when the invite was sent, null while queued. */
  sentAt: string | null;
}

export interface CascadeConfig {
  mode: 'individual' | 'group';
  /** Max attendees. null = uncapped (group mode); individual mode defaults to 1. */
  capacity: number | null;
}

export interface CascadeUpdate {
  id: string;
  status: InviteStatus;
  sentAt?: string;
}

const MS_PER_MINUTE = 60_000;

export function spotsRemaining(
  invites: readonly CascadeInvite[],
  config: CascadeConfig,
): number {
  const accepted = invites.filter((i) => i.status === 'accepted').length;
  const cap = config.capacity ?? (config.mode === 'individual' ? 1 : null);
  return cap === null ? Number.POSITIVE_INFINITY : cap - accepted;
}

export function inviteExpiresAt(invite: CascadeInvite): Date | null {
  if (invite.status !== 'sent' || !invite.sentAt) return null;
  return new Date(
    new Date(invite.sentAt).getTime() + invite.windowMinutes * MS_PER_MINUTE,
  );
}

/** Whether an acceptance can be honored right now (guards the accept action). */
export function canAccept(
  invites: readonly CascadeInvite[],
  config: CascadeConfig,
): boolean {
  return spotsRemaining(invites, config) > 0;
}

/**
 * Advance the cascade to its correct state at `now`.
 * Returns the minimal set of status updates to persist. Idempotent:
 * re-running with the applied updates yields no further changes.
 */
export function advanceCascade(
  invites: readonly CascadeInvite[],
  config: CascadeConfig,
  now: Date,
): CascadeUpdate[] {
  const updates: CascadeUpdate[] = [];
  const list = invites
    .map((i) => ({ ...i }))
    .sort((a, b) => a.position - b.position);

  // 1. Expire overdue live invites.
  for (const invite of list) {
    const expiresAt = inviteExpiresAt(invite);
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      invite.status = 'expired';
      updates.push({ id: invite.id, status: 'expired' });
    }
  }

  // 2. If the event is full, retire everything still waiting — including
  //    open-table join requests ('requested'), which can never be approved
  //    once there are no spots and would otherwise sit pending forever.
  const spots = spotsRemaining(list, config);
  if (spots <= 0) {
    for (const invite of list) {
      if (
        invite.status === 'queued' ||
        invite.status === 'sent' ||
        invite.status === 'requested'
      ) {
        invite.status = 'cancelled';
        updates.push({ id: invite.id, status: 'cancelled' });
      }
    }
    return updates;
  }

  // 3. Send the next invite(s).
  if (config.mode === 'individual') {
    const hasLiveInvite = list.some((i) => i.status === 'sent');
    if (!hasLiveInvite) {
      const next = list.find((i) => i.status === 'queued');
      if (next) {
        next.status = 'sent';
        updates.push({ id: next.id, status: 'sent', sentAt: now.toISOString() });
      }
    }
    return updates;
  }

  // Group mode: walk stages in order; send the first stage that still has
  // queued invites, but only if every earlier stage is fully resolved.
  const stages = [...new Set(list.map((i) => i.groupStage))].sort(
    (a, b) => a - b,
  );
  for (const stage of stages) {
    const stageInvites = list.filter((i) => i.groupStage === stage);
    const queued = stageInvites.filter((i) => i.status === 'queued');
    if (queued.length > 0) {
      for (const invite of queued) {
        invite.status = 'sent';
        updates.push({
          id: invite.id,
          status: 'sent',
          sentAt: now.toISOString(),
        });
      }
      break;
    }
    const stillPending = stageInvites.some((i) => i.status === 'sent');
    if (stillPending) break; // wait for this stage to resolve
  }
  return updates;
}

/**
 * Preview simulator: projects when each invite would go out if nobody
 * accepts and every window runs to expiry. Powers the pre-send timeline.
 */
export interface CascadePreviewEntry {
  id: string;
  wouldSendAt: Date;
  wouldExpireAt: Date;
}

export function simulateCascade(
  invites: readonly CascadeInvite[],
  config: CascadeConfig,
  startAt: Date,
): CascadePreviewEntry[] {
  const list = [...invites].sort((a, b) => a.position - b.position);
  const entries: CascadePreviewEntry[] = [];

  if (config.mode === 'individual') {
    let cursor = startAt.getTime();
    for (const invite of list) {
      const expires = cursor + invite.windowMinutes * MS_PER_MINUTE;
      entries.push({
        id: invite.id,
        wouldSendAt: new Date(cursor),
        wouldExpireAt: new Date(expires),
      });
      cursor = expires;
    }
    return entries;
  }

  const stages = [...new Set(list.map((i) => i.groupStage))].sort(
    (a, b) => a - b,
  );
  let cursor = startAt.getTime();
  for (const stage of stages) {
    const stageInvites = list.filter((i) => i.groupStage === stage);
    const stageWindow = Math.max(...stageInvites.map((i) => i.windowMinutes));
    for (const invite of stageInvites) {
      entries.push({
        id: invite.id,
        wouldSendAt: new Date(cursor),
        wouldExpireAt: new Date(
          cursor + invite.windowMinutes * MS_PER_MINUTE,
        ),
      });
    }
    cursor += stageWindow * MS_PER_MINUTE;
  }
  return entries;
}
