import type { SwitchboardEvent } from '@/lib/types';

/**
 * How `/plans` sorts a person's plans into sections, as a pure function so the
 * rule is testable apart from the page's database reads.
 *
 * Each invite status has exactly one home. "Going" used to take every answered
 * invitation that wasn't still waiting on you, so a waitlisted guest saw a plan
 * listed under Going that had no seat for them, and an Open Table request (a
 * `requested` invite) never appeared at all. Neither is a yes that counts, and
 * neither is a guardian-held yes (`pending_approval`), so each gets a section
 * that says what it actually is.
 */

export interface InvitedPlan {
  status: string;
  event: SwitchboardEvent;
}

export interface PlanSections {
  /** Sent invitations with a response window running. */
  needsResponse: InvitedPlan[];
  /** Queued invitations on a plan still polling for its date. */
  deciding: InvitedPlan[];
  /** A yes held until a parent or guardian approves it. */
  awaitingGuardian: InvitedPlan[];
  /** Plans you host or co-host, still ahead. */
  hosting: Array<{ event: SwitchboardEvent; cohost: boolean }>;
  /** Accepted invitations — a yes that holds a seat. */
  going: InvitedPlan[];
  /** Said yes after the plan filled. */
  waitlisted: InvitedPlan[];
  /** Open Table requests the host has not answered yet. */
  requested: InvitedPlan[];
  /** Plans you hosted, co-hosted, or went to, newest first. */
  past: SwitchboardEvent[];
}

/**
 * "Already happened" is judged by the actual start time (with the 'past'
 * status as a fallback) so a plan drops into the archive as soon as it is over —
 * even before the status-sweeping cron catches up. Plans with no set date
 * (Time TBD) are treated as upcoming.
 */
export function hasHappened(event: SwitchboardEvent, nowMs: number): boolean {
  return (
    event.status === 'past' ||
    (event.starts_at !== null && new Date(event.starts_at).getTime() < nowMs)
  );
}

export function sortPlans(input: {
  userId: string;
  hosted: SwitchboardEvent[];
  cohosted: SwitchboardEvent[];
  invited: InvitedPlan[];
  nowMs: number;
}): PlanSections {
  const { userId, nowMs } = input;
  const hostedIds = new Set(input.hosted.map((event) => event.id));
  // A co-hosted plan is listed as hosting, once, whether or not the co-host
  // also holds an invitation to it.
  const cohosted = input.cohosted.filter(
    (event) =>
      !hostedIds.has(event.id) &&
      event.host_id !== userId &&
      event.status !== 'cancelled',
  );
  const managedIds = new Set([...hostedIds, ...cohosted.map((event) => event.id)]);

  const invited = input.invited.filter(
    (row) =>
      !managedIds.has(row.event.id) &&
      row.event.host_id !== userId &&
      row.event.status !== 'cancelled' &&
      // A queued invite is only yours to see while the group is deciding;
      // once invites start going out, it becomes `sent` and shows up above.
      (row.status !== 'queued' || row.event.status === 'deciding'),
  );

  const upcoming = invited.filter((row) => !hasHappened(row.event, nowMs));
  const byStatus = (status: string) => upcoming.filter((row) => row.status === status);

  const managed = [
    ...input.hosted.map((event) => ({ event, cohost: false })),
    ...cohosted.map((event) => ({ event, cohost: true })),
  ];

  // Past plans are the ones you hosted or actually went to. An invitation you
  // never answered, a waitlist spot, or a request nobody granted is not a plan
  // you were part of, so it is dropped rather than archived.
  const past = [
    ...managed.filter(({ event }) => hasHappened(event, nowMs)).map(({ event }) => event),
    ...invited
      .filter((row) => row.status === 'accepted' && hasHappened(row.event, nowMs))
      .map((row) => row.event),
  ].sort((a, b) => {
    const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return tb - ta;
  });

  return {
    needsResponse: byStatus('sent'),
    deciding: byStatus('queued'),
    awaitingGuardian: byStatus('pending_approval'),
    hosting: managed
      .filter(({ event }) => !hasHappened(event, nowMs))
      .sort((a, b) => {
        // Same order the hosted query asks for: dated plans soonest first,
        // undated ones after them.
        const ta = a.event.starts_at ? new Date(a.event.starts_at).getTime() : Infinity;
        const tb = b.event.starts_at ? new Date(b.event.starts_at).getTime() : Infinity;
        return ta - tb;
      }),
    going: byStatus('accepted'),
    waitlisted: byStatus('waitlisted'),
    requested: byStatus('requested'),
    past,
  };
}

/** Every invite status `/plans` has a section for — the page's query reads these. */
export const LISTED_INVITE_STATUSES = [
  'sent',
  'queued',
  'pending_approval',
  'accepted',
  'waitlisted',
  'requested',
] as const;
