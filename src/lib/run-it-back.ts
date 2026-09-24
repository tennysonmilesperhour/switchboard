/**
 * Who Run It Back carries into the next plan.
 *
 * "Same crew, minus anyone who said it wasn't their thing" - but the only rule
 * applied was the second half, so the carry-over also swept in people who were
 * never crew:
 *
 *   - `requested`: a stranger's open-table request the host never approved.
 *     Run It Back turned a request the host had left unanswered into a live
 *     invitation to the next plan.
 *   - the host's own row, when they had answered their own share link.
 *   - the same person twice, where the list held two rows for them: the copy
 *     then sent them two invitations to one plan.
 */

export interface PriorInvite {
  invitee_id: string | null;
  guest_name: string | null;
  guest_contact: string | null;
  status: string;
  decline_note: string | null;
}

export function runItBackCrew<T extends PriorInvite>(prior: readonly T[], hostId: string): T[] {
  const seen = new Set<string>();
  return prior.filter((invite) => {
    if (invite.decline_note === 'not_my_thing') return false;
    if (invite.status === 'requested') return false;
    if (invite.invitee_id === hostId) return false;
    const key = invite.invitee_id
      ? `id:${invite.invitee_id}`
      : `guest:${(invite.guest_contact ?? invite.guest_name ?? '').trim().toLowerCase()}`;
    if (key !== 'guest:' && seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
