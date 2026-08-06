/**
 * The canonical set of product-analytics events. Kept in one place so the
 * tracked surface is auditable and documented (see docs/analytics.md).
 *
 * Guardrail: never attach the CONTENT of a message, a poll vote, or a mutual
 * intent to any event. Only event shape and aggregates. The anonymity
 * invariants are enforced at the database layer and must not be undone here.
 */
export const ANALYTICS_EVENTS = {
  /** A plan was created. Powers habit + time-to-plan. */
  planCreated: 'plan_created',
  /** North Star: a plan actually happened (host affirmed). */
  planHappened: 'plan_happened',
  /** An invitee accepted or declined. Powers invitation health. */
  inviteResponded: 'invite_responded',
  /** A vote was cast in a group decision (never the weight or option). */
  pollVoted: 'poll_voted',
  /** Sean Ellis product-market-fit survey response. */
  pmfResponse: 'pmf_survey_response',
  /** A password account was created (top of the activation funnel). */
  signupCompleted: 'signup_completed',
  /** Onboarding finished; the profile is live. Powers signup→active conversion. */
  onboardingCompleted: 'onboarding_completed',
  /** A board post was created (kind only, never title or body). */
  boardPostCreated: 'board_post_created',
  /** A neighbor tapped "I can help" on an offer/request. */
  boardPostResponse: 'board_post_response',
  /** An offer/request was marked complete by its author. */
  boardPostFulfilled: 'board_post_fulfilled',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
