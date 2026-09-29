/**
 * Guardian approval, the parts that are pure: what a guardian is told, and how
 * a pending request is described back to the person waiting on it.
 *
 * Decision D2 fixes what a guardian may see: the plan's title, when and where
 * it is, who is hosting, and who said yes. Nothing else — not the description,
 * not the guest list — because the guardian is a stranger to the plan who needs
 * exactly enough to decide. Both the email and `/approve/<token>` render from
 * `guardianPlanFacts`, so the two cannot drift into showing different things.
 */

export type GuardianRequestStatus = 'pending' | 'approved' | 'denied';

/** A guardian request as the invitee sees it on their own invitation. */
export interface GuardianRequestView {
  status: GuardianRequestStatus;
  /**
   * Where it went, masked. The invitee typed it, but the card also renders on
   * `/rsvp/<token>`, a link that gets forwarded, and a guardian's address is
   * theirs to give out.
   */
  sentTo: string;
  requestedAt: string;
  /**
   * What happened to the newest email: `sent`, one of the failure outcomes, or
   * null for a request made before outcomes were recorded.
   */
  emailStatus: string | null;
}

/** `parent@example.com` → `p•••@example.com`. Never returns the local part. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${trimmed[0]}•••${trimmed.slice(at)}`;
}

/**
 * The newest request for one invite, shaped for the invitee. Rows may include
 * history (a denied request, then a new yes and a fresh request), so the most
 * recent wins.
 */
export function latestGuardianRequest(
  rows: ReadonlyArray<{
    status: string;
    guardian_email: string;
    created_at: string;
    email_status?: string | null;
  }>,
): GuardianRequestView | null {
  const latest = [...rows].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  if (!latest) return null;
  const status: GuardianRequestStatus =
    latest.status === 'approved' || latest.status === 'denied'
      ? latest.status
      : 'pending';
  return {
    status,
    sentTo: maskEmail(latest.guardian_email),
    requestedAt: latest.created_at,
    emailStatus: latest.email_status ?? null,
  };
}

/**
 * Whether the invitee's own invitation shows the guardian step, and about
 * which request.
 *
 * A held yes (`pending_approval`) always does, about its *pending* request if
 * there is one — never an older denied one, or a yes given again after a
 * denial would open onto "your guardian didn't approve" with no way to ask
 * again. A declined invite shows it only when a guardian's denial is what
 * declined it. Everything else has nothing to show.
 */
export function guardianStepFor(
  inviteStatus: string | null | undefined,
  rows: Parameters<typeof latestGuardianRequest>[0],
): { request: GuardianRequestView | null } | null {
  if (inviteStatus === 'pending_approval') {
    return { request: latestGuardianRequest(rows.filter((row) => row.status === 'pending')) };
  }
  if (inviteStatus === 'declined') {
    const latest = latestGuardianRequest(rows);
    return latest?.status === 'denied' ? { request: latest } : null;
  }
  return null;
}

/** Everything D2 lets a guardian see, already formatted for reading. */
export interface GuardianPlanFacts {
  title: string;
  /** Formatted in the plan's own zone; "Time TBD" while a date is polled. */
  when: string;
  where: string | null;
  hostName: string;
  inviteeName: string;
}

export function guardianApprovalEmail(input: {
  facts: GuardianPlanFacts;
  guardianName: string | null;
  link: string;
}): { subject: string; text: string } {
  const { facts } = input;
  return {
    subject: `Approval needed: ${facts.inviteeName} wants to join ${facts.title}`,
    text: [
      `Hi${input.guardianName ? ` ${input.guardianName}` : ''},`,
      '',
      `${facts.inviteeName} said yes to a plan on Switchboard, and the host has asked that a parent or guardian approve it before it counts.`,
      '',
      `What: ${facts.title}`,
      `When: ${facts.when}`,
      ...(facts.where ? [`Where: ${facts.where}`] : []),
      `Host: ${facts.hostName}`,
      '',
      'Their RSVP does not count until you answer. To approve or deny, open this link:',
      input.link,
      '',
      'If you did not expect this, you can safely ignore it.',
      '',
      '- Switchboard',
    ].join('\n'),
  };
}
