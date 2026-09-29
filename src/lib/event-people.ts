/**
 * Who appears where on a plan page, as pure functions over rows the page
 * loader has already authorized. Kept apart from `event-page.ts` so each rule
 * is testable on its own and the loader stays a list of reads.
 */
import type { InviteePerson } from '@/components/events/InviteeSheet';
import type { PendingParentalApproval } from '@/components/events/ParentalApprovalManager';

/** One row of `event_invite_list` (20260930012000_invite_list_visibility.sql). */
export interface InviteListRow {
  invite_id: string;
  invitee_id: string | null;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  status: string;
}

const LIST_LABEL: Record<string, string> = {
  accepted: 'Going',
  waitlisted: 'Waitlisted',
};

/**
 * The guest-facing invite list as tappable faces. The database has already
 * decided who is on it and what status each may show; this only shapes it, and
 * carries identity fields alone — a guest never gets a contact or a link.
 */
export function inviteListPeople(rows: ReadonlyArray<InviteListRow>): InviteePerson[] {
  return rows.map((row) => ({
    id: row.invite_id,
    name: row.display_name?.trim() || 'Guest',
    handle: row.handle ?? null,
    avatarUrl: row.avatar_url ?? null,
    seed: row.invitee_id ?? row.invite_id,
    isGuest: !row.invitee_id,
    statusLabel: LIST_LABEL[row.status] ?? 'Invited',
    contact: null,
    inviteUrl: null,
    messages: null,
  }));
}

/**
 * People the primary host can make a co-host in one tap (decision D1): anyone
 * on the guest list with an account, other than an Open Table request the host
 * has not let in, plus the host's own connections. The database re-checks the
 * same rule; this only spares the host typing a handle.
 */
export function cohostCandidates(input: {
  invites: ReadonlyArray<{
    invitee_id: string | null;
    invitee_name: string;
    invitee_handle: string | null;
    status: string;
  }>;
  connections: ReadonlyArray<{ id: string; name: string; handle: string }>;
  cohostIds: ReadonlyArray<string>;
  hostId: string;
}): Array<{ id: string; name: string; handle: string }> {
  const taken = new Set([...input.cohostIds, input.hostId]);
  const out = new Map<string, { id: string; name: string; handle: string }>();
  for (const invite of input.invites) {
    if (!invite.invitee_id || !invite.invitee_handle) continue;
    if (invite.status === 'requested' || taken.has(invite.invitee_id)) continue;
    out.set(invite.invitee_id, {
      id: invite.invitee_id,
      name: invite.invitee_name,
      handle: invite.invitee_handle,
    });
  }
  for (const person of input.connections) {
    if (!person.handle || taken.has(person.id) || out.has(person.id)) continue;
    out.set(person.id, person);
  }
  return [...out.values()];
}

/**
 * Every RSVP a host is waiting on a guardian for — including the ones where
 * nobody has been asked yet. The host panel used to list only requests that
 * already carried an email, so a yes whose guardian step was abandoned was
 * invisible to the one person who could chase it.
 *
 * Covers a held yes (`pending_approval`), and a pending request on a yes that
 * counted before holds existed.
 */
export function hostGuardianQueue(
  invites: ReadonlyArray<{
    id: string;
    status: string;
    invitee_name: string;
  }>,
  approvals: ReadonlyArray<{
    invite_id: string;
    guardian_email: string;
    guardian_name: string | null;
    email_status: string | null;
  }>,
): PendingParentalApproval[] {
  const byInvite = new Map(approvals.map((approval) => [approval.invite_id, approval]));
  return invites
    .filter((invite) => invite.status === 'pending_approval' || byInvite.has(invite.id))
    .map((invite) => {
      const approval = byInvite.get(invite.id) ?? null;
      return {
        inviteId: invite.id,
        inviteeName: invite.invitee_name,
        guardianEmail: approval?.guardian_email ?? null,
        guardianName: approval?.guardian_name ?? null,
        emailStatus: approval?.email_status ?? null,
      };
    });
}
