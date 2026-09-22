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

/**
 * The Open Graph card for an invite link, in one place because Next merges
 * metadata **shallowly**: a route that exports its own `openGraph` replaces the
 * root layout's entire object, it does not extend it
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md
 * — "Note the absence of `openGraph.description`"). Both invite routes set only
 * a title and an image, so the two links people actually paste into iMessage,
 * WhatsApp and Slack were the two unfurling with no description, no `og:type`
 * and no site name — every other page in the app kept all three.
 *
 * `description` is the plan's own when the caller has decided the link may
 * reveal it, and the app's line otherwise, so a card is never blank and a plan
 * that must not unfurl its details still does not.
 */
export const APP_UNFURL_DESCRIPTION =
  'Cascading invites, anonymous group decisions, and mutual-interest matching. Switchboard removes the social friction from making plans.';

export function inviteOpenGraph(input: {
  title: string;
  /** The plan's description, when this link may reveal it. */
  description?: string | null;
  /** The OG image URL, or nothing when the link must not unfurl details. */
  image?: string | null;
}) {
  const summary = input.description?.trim();
  return {
    type: 'website' as const,
    siteName: 'Switchboard',
    title: input.title,
    description: summary ? summary.slice(0, 200) : APP_UNFURL_DESCRIPTION,
    images: input.image ? [input.image] : [],
  };
}

/**
 * The one-line summary for an invite unfurl.
 *
 * The plan's own description when the host wrote one — that is what they would
 * want a recipient to read in the message thread. Failing that, the place, so
 * the card still says something concrete rather than falling back to the app's
 * generic line for a plan that has a location and simply no prose.
 *
 * Called only where the caller has already decided this link may reveal the
 * plan's details; it does no gating of its own.
 */
export function unfurlSummary(plan: {
  description?: string | null;
  location_name?: string | null;
}): string | null {
  return plan.description?.trim() || plan.location_name?.trim() || null;
}
