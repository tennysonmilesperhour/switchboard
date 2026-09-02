/** The push nudge is earned by real invitation activity, never first login. */
export function hasInviteActivity(
  receivedInvite: boolean,
  sentInvite: boolean,
): boolean {
  return receivedInvite || sentInvite;
}
