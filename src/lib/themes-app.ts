/**
 * App-wide appearance presets.
 *
 * Each one is a token override on `<html data-theme="…">`, defined in
 * `globals.css`. Components never reference a raw color — they use
 * `bg-terracotta`, `text-ink`, `bg-brand-gradient`, `plan-*` — so swapping the
 * token layer restyles the whole app without a single component fork. That is
 * exactly the re-theming path `docs/DESIGN-SYSTEM.md` describes; this makes it
 * something a person can do from Settings rather than a rewrite.
 *
 * Two of these come straight from the five art directions explored before
 * launch and shelved (`docs/archive/DESIGN-DIRECTIONS.md`) — fully specified
 * palettes that were never adopted because the app could only have one look.
 * It can have several now.
 *
 * The rules a preset has to keep:
 *
 * - **AA contrast, every combination.** `PRODUCT.md` targets WCAG AA, and a
 *   preset is not an excuse to drop below it. `themes-app.test.ts` checks the
 *   text-on-surface pairs that carry the app's reading.
 * - **Every token a preset touches, it touches completely.** A half-swapped
 *   palette (new background, old ink) is how a theme ends up unreadable in one
 *   corner of the app nobody opened while building it.
 * - **Semantics stay semantic.** `sage` still means availability and
 *   acceptance, `rose` still means decline, in every preset. A theme changes
 *   the register, never the meaning.
 */

export interface AppTheme {
  id: AppThemeId;
  name: string;
  /** One line, in the register of the theme itself. */
  blurb: string;
  /** Swatches for the picker: [background, surface, accent]. */
  swatches: [string, string, string];
  /**
   * Earned rather than simply chosen — the passport's one reward. Nothing is
   * taken away once unlocked, because a stamp is permanent.
   */
  earned?: boolean;
  /**
   * Configured rather than fixed: its palette comes from the person's own
   * choices, derived in `theme-custom.ts`, not from a block in globals.css.
   * Picking it opens an editor instead of just applying.
   */
  custom?: boolean;
  /**
   * The preset's own display face, as a CSS `font-family` value, for presets
   * that swap the type as well as the palette. The picker sets each name in
   * it, because a typeface is the half of these looks a swatch can't show.
   */
  font?: string;
}

export type AppThemeId =
  | 'default'
  | 'almanac'
  | 'transit'
  | 'afterparty'
  | 'guestlist'
  | 'prompt'
  | 'custom';

export const APP_THEMES: readonly AppTheme[] = [
  {
    id: 'default',
    name: 'Switchboard',
    blurb: 'Bright, warm, and loud in the right places.',
    swatches: ['#f9fbfd', '#ffffff', '#dc2558'],
  },
  {
    id: 'almanac',
    name: 'Almanac',
    blurb: 'Cream paper and ink, like a well-kept planner.',
    swatches: ['#f6f1e5', '#fffdf7', '#9c2f24'],
  },
  {
    id: 'transit',
    name: 'Transit',
    blurb: 'Departure-board discipline. One signal color, nothing spare.',
    swatches: ['#faf8f5', '#ffffff', '#d14700'],
    earned: true,
  },
  {
    id: 'afterparty',
    name: 'Afterparty',
    blurb: 'Plum-black, party pink, poster type. Every plan is an event.',
    swatches: ['#160e26', '#241939', '#c2186b'],
    font: 'var(--font-bricolage), sans-serif',
  },
  {
    id: 'guestlist',
    name: 'Guestlist',
    blurb: 'Cool white, fine lines, black buttons. Calm and exact.',
    swatches: ['#f7f7f6', '#ffffff', '#131316'],
    font: 'var(--font-geist), sans-serif',
  },
  {
    id: 'prompt',
    name: 'Prompt',
    blurb: 'White page, a serif voice, one plum. Every plan reads like an ask.',
    swatches: ['#ffffff', '#f6f3f7', '#5b2a86'],
    font: 'var(--font-newsreader), Georgia, serif',
  },
  {
    id: 'custom',
    name: 'Yours',
    blurb: 'Your photo, your colors. The rest is worked out from them.',
    swatches: ['#f9fbfd', '#eeae36', '#f82a63'],
    custom: true,
  },
] as const;

const IDS = new Set<string>(APP_THEMES.map((theme) => theme.id));

/**
 * Coerce a stored value to a theme the CSS actually defines.
 *
 * A profile row can outlive the deploy that wrote it — an older client, a
 * rolled-back release, a value typed straight into the database — and an
 * unknown `data-theme` would leave the app with no token overrides and no
 * explanation. Falling back is always readable.
 */
export function resolveTheme(value: string | null | undefined): AppThemeId {
  return value && IDS.has(value) ? (value as AppThemeId) : 'default';
}

export function themeById(id: AppThemeId): AppTheme {
  return APP_THEMES.find((theme) => theme.id === id) ?? APP_THEMES[0];
}

/** Which themes this person may pick right now. */
export function availableThemes(passportComplete: boolean): AppTheme[] {
  return APP_THEMES.filter((theme) => !theme.earned || passportComplete);
}
