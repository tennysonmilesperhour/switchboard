/**
 * What Home puts first. "Waiting on you" is the one time-sensitive block on
 * the page, so it must only carry invitations a person can still act on: an
 * unanswered invite to a plan that already happened is noise, not urgency.
 */

export interface PendingInviteEvent {
  id: string;
  title: string;
  starts_at: string | null;
  time_zone?: string | null;
}

export interface PendingInvite<E extends PendingInviteEvent = PendingInviteEvent> {
  id: string;
  /** PostgREST returns an embedded row as an object or a one-element array. */
  event: E | E[] | null;
}

export interface OrderedPendingInvite<E extends PendingInviteEvent = PendingInviteEvent> {
  id: string;
  event: E;
}

/**
 * Keep the invitations that still need an answer and put the soonest first.
 * A plan with no start yet (still being polled) can still be answered, so it
 * stays, after everything with a date. A plan whose start is already behind
 * `now` is dropped: responding to it changes nothing.
 */
export function pendingInvitesInOrder<E extends PendingInviteEvent>(
  invites: readonly PendingInvite<E>[] | null | undefined,
  now: Date,
): OrderedPendingInvite<E>[] {
  const cutoff = now.getTime();
  const kept: OrderedPendingInvite<E>[] = [];
  for (const invite of invites ?? []) {
    const event = Array.isArray(invite.event) ? invite.event[0] : invite.event;
    if (!event) continue;
    if (event.starts_at) {
      const startsAt = Date.parse(event.starts_at);
      if (Number.isNaN(startsAt) || startsAt < cutoff) continue;
    }
    kept.push({ id: invite.id, event });
  }
  return kept.sort((a, b) => {
    const left = a.event.starts_at ? Date.parse(a.event.starts_at) : Number.POSITIVE_INFINITY;
    const right = b.event.starts_at ? Date.parse(b.event.starts_at) : Number.POSITIVE_INFINITY;
    return left - right;
  });
}
