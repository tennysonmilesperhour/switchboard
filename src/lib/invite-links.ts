/**
 * Canonical destination for a direct invitation.
 *
 * Direct invites are capability links: the unguessable per-invite token works
 * signed out, on a new device, during account creation, and when the browser is
 * signed into a different account. An event id alone is RLS-gated and therefore
 * must only be the fallback for legacy rows that predate guest_token.
 */
export function directInvitePath(eventId: string, token: string | null): string {
  return token ? `/rsvp/${token}` : `/events/${eventId}`;
}
