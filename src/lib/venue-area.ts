/**
 * Partner perks are scoped to the viewer's area (D14): a perk is only useful
 * somewhere you can actually go. Both sides of the match are free text — the
 * viewer's profile `location` and a venue's `area` — so this is deliberately
 * plain: the part of the viewer's location before the first comma ("Salt Lake
 * City" from "Salt Lake City, UT"), matched case-insensitively anywhere in the
 * venue's area.
 */

/** The longest area key we'll search on; profile locations are short. */
const MAX_AREA_KEY = 60;

/** The viewer's area to match venues against, or null when they have none. */
export function venueAreaKey(location: string | null | undefined): string | null {
  const first = (location ?? '').split(',')[0]?.trim() ?? '';
  const key = first.replace(/\s+/g, ' ').slice(0, MAX_AREA_KEY).trim();
  return key.length >= 2 ? key : null;
}

/** The most claims one person may file in a day. */
export const VENUE_CLAIMS_PER_DAY = 5;
/** The most claims one person may have waiting for review at once. */
export const VENUE_MAX_PENDING = 3;
