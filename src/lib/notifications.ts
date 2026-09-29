/**
 * Notification categories — the user-facing grouping of every push we send.
 *
 * Each domain action tags its notification with a fine-grained `kind`
 * (see the notifyUsers() calls across src/lib/actions and src/lib/server).
 * Users don't want to reason about a dozen kinds, so we fold them into a
 * handful of intuitive categories they can toggle in Settings. The mapping
 * lives here — shared by the server (to decide whether a given push is
 * allowed) and the client (to render the toggles) so the two never drift.
 *
 * A category gates the PUSH only. The in-app notifications feed still records
 * everything, the same way quiet hours suppress the interruption but never the
 * history.
 */

export type NotificationCategory =
  | 'plans'
  | 'suggestions'
  | 'reminders'
  | 'messages'
  | 'social';

/** The `profiles` boolean column backing each category. */
export type NotificationColumn =
  | 'notify_plans'
  | 'notify_suggestions'
  | 'notify_reminders'
  | 'notify_messages'
  | 'notify_social';

export interface NotificationCategoryMeta {
  key: NotificationCategory;
  column: NotificationColumn;
  emoji: string;
  label: string;
  description: string;
}

/** Ordered for display in Settings — most-central to the product first. */
export const NOTIFICATION_CATEGORIES: NotificationCategoryMeta[] = [
  {
    key: 'plans',
    column: 'notify_plans',
    emoji: '📅',
    label: 'Invitations & plans',
    description:
      'New invitations, RSVPs, join requests, plan changes, and host updates.',
  },
  {
    key: 'suggestions',
    column: 'notify_suggestions',
    emoji: '🗳',
    label: 'New ideas to vote on',
    description:
      'Someone adds an idea to a plan you’re voting on, so you can rank it.',
  },
  {
    key: 'reminders',
    column: 'notify_reminders',
    emoji: '⏰',
    label: 'Event reminders',
    description: 'A nudge before something you said yes to begins.',
  },
  {
    key: 'messages',
    column: 'notify_messages',
    emoji: '💬',
    label: 'Comments & photos',
    description: 'Replies on an event thread and photos shared in a room.',
  },
  {
    key: 'social',
    column: 'notify_social',
    emoji: '✨',
    label: 'Connections & matches',
    description: 'Connection requests, accepted connections, mutual matches, and posts on your boards.',
  },
];

/** Full preference set — one boolean per category. */
export type NotificationPrefs = Record<NotificationCategory, boolean>;

/** Every category on — the default for a brand-new account and the "all on" state. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  plans: true,
  suggestions: true,
  reminders: true,
  messages: true,
  social: true,
};

/**
 * Map a notification `kind` to the category that gates it. Keep this in sync
 * with the `kind:` values passed to notifyUsers() / sendPushToUsers(). An
 * unmapped kind returns null and is treated as always-allowed, so a new kind
 * is never silently swallowed by an unrelated toggle.
 */
const KIND_TO_CATEGORY: Record<string, NotificationCategory> = {
  // Invitations & plans
  event_invite: 'plans',
  rsvp_accepted: 'plans',
  rsvp_declined_note: 'plans',
  join_request: 'plans',
  join_approved: 'plans',
  event_updated: 'plans',
  event_urgent_change: 'plans',
  event_cancelled: 'plans',
  announcement: 'plans',
  board_response: 'plans',
  // Being made a co-host is a plan you now help run.
  cohost_added: 'plans',
  // A plan whose date was still being voted on now has one. Goes to everyone
  // who already said yes through the share link, so it must honour notify_plans
  // like every other plan update rather than falling through uncategorised.
  event_date_set: 'plans',
  // New ideas to vote on. Deliberately NOT 'plans': a brainstorm arrives in
  // bursts, and someone who wants to escape that must be able to do it without
  // also muting invitations and cancellations.
  poll_suggestion: 'suggestions',
  // A follow-up decision just became answerable because the one before it
  // landed. This is a plan update, not a brainstorm: it happens once per
  // decision, and missing it means missing your say on the next question.
  poll_opened: 'plans',
  // Event reminders
  reminder: 'reminders',
  // Comments & photos
  event_comment: 'messages',
  photo: 'messages',
  room_message: 'messages',
  // Connections & matches
  connection_request: 'social',
  connection_accepted: 'social',
  match: 'social',
  // Someone asking to be let into a private zone, and the answer. Both are
  // about who is in a group with you, which is what 'social' covers.
  zone_join_request: 'social',
  zone_join_approved: 'social',
  zone_join_denied: 'social',
  // A new post on a board you belong to, and being added to a board. A busy
  // board posts often; unmapped, these could not be muted without turning off
  // every push, so they sit with the other "who is in a group with you" kinds.
  board_post: 'social',
  board_added: 'social',
  // Anonymous "someone's down to connect" nudge — never names the sender, so it
  // belongs with the other consent-first social signals, gated by notify_social.
  interest_received: 'social',
  moment: 'social',
  ritual: 'social',
  // Left unmapped on purpose, so no toggle can hide an answer someone is
  // waiting on: parental_approval, parental_approval_denied (a guardian's
  // decision) and venue_review (the outcome of a partner claim).
};

export function categoryForKind(kind: string): NotificationCategory | null {
  return KIND_TO_CATEGORY[kind] ?? null;
}

const COLUMN_BY_CATEGORY: Record<NotificationCategory, NotificationColumn> =
  Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c) => [c.key, c.column]),
  ) as Record<NotificationCategory, NotificationColumn>;

export function columnForCategory(
  category: NotificationCategory,
): NotificationColumn {
  return COLUMN_BY_CATEGORY[category];
}
