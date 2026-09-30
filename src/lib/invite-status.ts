import type { InviteStatus } from '@/lib/engine/cascade';

/**
 * How an invite's state reads to a host, in one place.
 *
 * The cascade view and the contact card that opens from it both label the same
 * invite, and a person's card saying "Accepted" next to a row saying "Invited -
 * waiting" is the kind of small contradiction that makes a host distrust the
 * whole screen. The card is assembled on the server and the row is rendered on
 * the client, so the copy lives here rather than in either of them.
 */
export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  queued: 'Waiting in line',
  sent: 'Invited - waiting',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'No response',
  cancelled: 'Not needed',
  waitlisted: 'Waitlisted',
  requested: 'Asked to join',
  pending_approval: 'Waiting on a guardian',
};

/** Fail closed if a database CHECK value is newer than this application. */
export function normalizeInviteStatus(status: string): InviteStatus {
  switch (status) {
    case 'queued':
    case 'sent':
    case 'accepted':
    case 'declined':
    case 'expired':
    case 'cancelled':
    case 'waitlisted':
    case 'requested':
    case 'pending_approval':
      return status;
    default:
      return 'cancelled';
  }
}
