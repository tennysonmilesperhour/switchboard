import {
  NOTIFICATION_CATEGORIES,
  categoryForKind,
  type NotificationCategory,
} from './notifications';

/**
 * The shape a live banner needs, distilled from a notifications row. Kept
 * separate from the DB row so the client component and its tests share one
 * source of truth for what a banner is.
 */
export interface NotificationBanner {
  /** The notifications.id — the dedupe key, so a re-delivered event never
   *  stacks a second identical banner. */
  id: string;
  title: string;
  body: string | null;
  /** Where tapping the banner goes. Null means "no destination" — the banner is
   *  still shown, it just isn't a link. */
  url: string | null;
  /** A leading glyph, chosen from the notification's category so a match, a
   *  message, and a reminder read differently at a glance. */
  glyph: string;
}

/** The minimal row fields a banner is built from. */
export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
}

const EMOJI_BY_CATEGORY: Record<NotificationCategory, string> = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c.emoji]),
) as Record<NotificationCategory, string>;

/**
 * A room message and a photo are both "messages", but a banner that says "new
 * message" wants a speech bubble, not the category's comments-and-photos glyph.
 * These kinds get a more specific face; everything else falls back to its
 * category emoji, and an unmapped kind to a neutral bell.
 */
const GLYPH_BY_KIND: Record<string, string> = {
  room_message: '💬',
  event_comment: '💬',
  match: '🎉',
  connection_accepted: '🤝',
  connection_request: '🤝',
  interest_received: '✨',
  reminder: '⏰',
};

/**
 * The glyph to lead a banner with, for a given notification kind. Prefers a
 * kind-specific face, then the kind's category emoji, then a neutral bell so a
 * brand-new kind is never faceless.
 */
export function notificationGlyph(kind: string): string {
  const specific = GLYPH_BY_KIND[kind];
  if (specific) return specific;
  const category = categoryForKind(kind);
  if (category) return EMOJI_BY_CATEGORY[category];
  return '🔔';
}

/** Build the banner a live notifications row should surface. */
export function bannerFromRow(row: NotificationRow): NotificationBanner {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? null,
    url: row.url ?? null,
    glyph: notificationGlyph(row.kind),
  };
}
