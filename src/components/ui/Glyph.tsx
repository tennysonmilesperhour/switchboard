import type { ReactNode, SVGProps } from 'react';

/**
 * Line symbols that stand in for emoji across the app.
 *
 * Emoji render as whatever the device's vendor drew, which on most phones is a
 * glossy cartoon that fights the rest of the design. Stored data (signal
 * presets, interests, circles, experiences) still carries emoji, so this maps a
 * character to a drawn symbol at render time instead of migrating the data.
 * Everything draws in `currentColor`, so a symbol follows its surroundings: ink
 * in a chip, white on a selected one.
 *
 * `glyphFor` is the lookup; `<Glyph emoji="☕" />` is the renderer. An emoji
 * with no entry (someone typed their own) gets the neutral spark rather than
 * the vendor cartoon, so the screen never mixes the two styles.
 */

type Shape = ReactNode;

const dot: Shape = (
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  </>
);
const ring: Shape = <circle cx="12" cy="12" r="8" />;
const spark: Shape = (
  <path d="M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7zM19 16.5c.2 1.6.7 2.1 2.2 2.3-1.5.2-2 .7-2.2 2.2-.2-1.5-.7-2-2.2-2.2 1.5-.2 2-.7 2.2-2.3z" />
);
const coffee: Shape = (
  <>
    <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" />
    <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
    <path d="M8 3v3M12 3v3" />
  </>
);
const walk: Shape = (
  <>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M10 21l2-6-2.5-2.5 1.5-4.5 3 2 2.5.5M9 12l-2.5 2M12 15l3.5 1.5 1 4.5" />
  </>
);
const bike: Shape = (
  <>
    <circle cx="6" cy="16" r="3.5" />
    <circle cx="18" cy="16" r="3.5" />
    <path d="M6 16l4-8h5l3 8M10 8l3 8M14 5h2.5" />
  </>
);
const chat: Shape = <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />;
const mic: Shape = (
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>
);
const ear: Shape = (
  <>
    <path d="M6 9a6 6 0 1 1 12 0c0 5-5 5.5-5 9a3 3 0 0 1-6 0" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2.5-2.5 4.5" />
  </>
);
const dice: Shape = (
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
  </>
);
const users: Shape = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </>
);
const book: Shape = (
  <>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14H6.5A1.5 1.5 0 0 0 5 18.5v-14z" />
    <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3" />
  </>
);
const notes: Shape = (
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </>
);
const calendar: Shape = (
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>
);
const repeat: Shape = <path d="M17 3l3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4" />;
const pin: Shape = (
  <>
    <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z" />
    <circle cx="12" cy="10" r="2.3" />
  </>
);
const compass: Shape = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
  </>
);
const camera: Shape = (
  <>
    <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </>
);
const check: Shape = <path d="M5 12.5l4.5 4.5L19 7.5" />;
const checkCircle: Shape = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.3l3 3 5-6" />
  </>
);
const close: Shape = <path d="M6 6l12 12M18 6L6 18" />;
const house: Shape = (
  <>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 9.5V20h12V9.5M10 20v-6h4v6" />
  </>
);
const shop: Shape = (
  <>
    <path d="M4 9l1.5-5h13L20 9a2.5 2.5 0 0 1-4 2 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4-2z" />
    <path d="M5 12v8h14v-8M10 20v-4h4v4" />
  </>
);
const ladder: Shape = <path d="M8 3v18M16 3v18M8 7h8M8 12h8M8 17h8" />;
const ballot: Shape = (
  <>
    <rect x="4" y="12" width="16" height="8" rx="1.5" />
    <path d="M9 16h6M8 12V5h8v7M10.5 8h3" />
  </>
);
const link: Shape = <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />;
const lock: Shape = (
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>
);
const megaphone: Shape = (
  <>
    <path d="M4 10v4h3l8 4V6L7 10H4z" />
    <path d="M18.5 9.5a3.5 3.5 0 0 1 0 5M7 14l1.5 5" />
  </>
);
const heart: Shape = <path d="M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z" />;
const gift: Shape = (
  <>
    <rect x="3.5" y="8" width="17" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12" />
    <path d="M12 8C9.5 8 8 6.9 8 5.5S9 3.5 10 4c1.3.6 2 2.3 2 4zM12 8c2.5 0 4-1.1 4-2.5S15 3.5 14 4c-1.3.6-2 2.3-2 4z" />
  </>
);
const mail: Shape = (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </>
);
const bell: Shape = (
  <>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </>
);
const clock: Shape = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);
const hourglass: Shape = <path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9" />;
const leaf: Shape = <path d="M5 19c0-9 5-14 15-15 0 10-5 15-14 15M5 19l7-7" />;
const utensils: Shape = <path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17" />;
const glass: Shape = <path d="M7 3h10l-.7 7.5a4.3 4.3 0 0 1-8.6 0L7 3zM12 14.5V21M8.5 21h7" />;
const moon: Shape = <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />;
const cloud: Shape = <path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.8 4.8 0 0 1 17.5 18H7z" />;
const sun: Shape = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </>
);
const wave: Shape = <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />;
const eye: Shape = (
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>
);
const globe: Shape = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
  </>
);
const palette: Shape = (
  <>
    <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.3.2-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
  </>
);
const music: Shape = (
  <>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </>
);
const dumbbell: Shape = <path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12" />;
const sofa: Shape = (
  <>
    <path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
    <path d="M3 12.5a2 2 0 0 1 4 0V15h10v-2.5a2 2 0 0 1 4 0V18H3v-5.5zM6 18v2M18 18v2" />
  </>
);
const shapes: Shape = (
  <>
    <circle cx="8" cy="8" r="4" />
    <rect x="12" y="12" width="8" height="8" rx="1.5" />
    <path d="M5 20l3.5-6L12 20H5z" />
  </>
);
const laptop: Shape = (
  <>
    <rect x="5" y="5" width="14" height="10" rx="1.5" />
    <path d="M3 19h18" />
  </>
);
const chess: Shape = <path d="M9 4h6M12 4v3M8 10c0-2 1.8-3 4-3s4 1 4 3c0 1.5-1 2.5-2 3.5l1 4.5H9l1-4.5C9 12.5 8 11.5 8 10zM7 21h10M8 18h8" />;
const battery: Shape = (
  <>
    <rect x="3" y="8" width="16" height="8" rx="2" />
    <path d="M21.5 11v2M6 11v2M9 11v2" />
  </>
);
const batteryLow: Shape = (
  <>
    <rect x="3" y="8" width="16" height="8" rx="2" />
    <path d="M21.5 11v2M6 11v2" />
  </>
);
const smile: Shape = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5v.5M15 9.5v.5" />
  </>
);
const ban: Shape = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </>
);
const signal: Shape = <path d="M12 12v9M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />;
const mirror: Shape = (
  <>
    <ellipse cx="12" cy="10" rx="6" ry="7" />
    <path d="M12 17v4M8.5 21h7" />
  </>
);
const search: Shape = (
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
  </>
);
const idCard: Shape = (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="11" r="2" />
    <path d="M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2M14.5 10h3.5M14.5 14h3.5" />
  </>
);
const arrowDown: Shape = <path d="M12 4v15M6 13l6 6 6-6" />;
const inbox: Shape = <path d="M3 13l2.5-8h13L21 13v6H3v-6zM3 13h5.5a3.5 3.5 0 0 0 7 0H21" />;
const tent: Shape = <path d="M3 20L12 4l9 16H3zM12 4v16M9 20l3-5 3 5" />;
const pencil: Shape = <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1zM14 7l3 3" />;
const pushpin: Shape = <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v8" />;
const box: Shape = (
  <>
    <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z" />
    <path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" />
  </>
);
const bulb: Shape = <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />;
const mountain: Shape = <path d="M3 20l6.5-11 4 6.5L16 12l5 8H3z" />;
const city: Shape = <path d="M4 21V9l6-3v15M10 21V4l10 4v13M3 21h18M14 11h2M14 15h2M7 11v.01M7 15v.01" />;
const plane: Shape = <path d="M10 14L3 11.5V10l7-1.5L14 3h2l-2 5.5 5-1.5c1.5-.3 2.5.5 2 1.5-.5 1-1.5 1-3 1.3L13 10.5 16 15v1.5L12.5 15 10 18v-4z" />;
const flower: Shape = (
  <>
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 9.5C10.5 7.5 10.5 5 12 3c1.5 2 1.5 4.5 0 6.5zM12 14.5c1.5 2 1.5 4.5 0 6.5-1.5-2-1.5-4.5 0-6.5zM9.5 12C7.5 10.5 5 10.5 3 12c2 1.5 4.5 1.5 6.5 0zM14.5 12c2-1.5 4.5-1.5 6.5 0-2 1.5-4.5 1.5-6.5 0z" />
  </>
);
const hand: Shape = <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11M14 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7C8 21 6.5 19.5 5.5 17.5L4 14.5a1.5 1.5 0 0 1 2.5-1.5L8 14.5" />;
const volumeOff: Shape = <path d="M4 10v4h3.5L12 18V6L7.5 10H4zM16 9.5l5 5M21 9.5l-5 5" />;
const halfCircle: Shape = (
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
  </>
);
const square: Shape = <rect x="5" y="5" width="14" height="14" rx="2" />;
const film: Shape = (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" />
  </>
);
const banknote: Shape = (
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6.5 12h.01M17.5 12h.01" />
  </>
);
const crossedFingers: Shape = spark;

const MAP: Record<string, Shape> = {
  '🟢': dot,
  '○': ring,
  '◐': halfCircle,
  '☐': square,
  '✨': spark,
  '✦': spark,
  '❋': spark,
  '🎉': spark,
  '🤞': crossedFingers,
  '🛝': spark,
  '☕': coffee,
  '🫖': coffee,
  '🚶': walk,
  '🚴': bike,
  '💬': chat,
  '🎤': mic,
  '👂': ear,
  '🎲': dice,
  '🤝': heart,
  '🙋': hand,
  '🤲': hand,
  '👋': hand,
  '👥': users,
  '👨': users,
  '👩': users,
  '👧': users,
  '📚': book,
  '📋': notes,
  '📝': notes,
  '📅': calendar,
  '🗓': calendar,
  '🔁': repeat,
  '📍': pin,
  '🧭': compass,
  '📷': camera,
  '✓': check,
  '✅': checkCircle,
  '✕': close,
  '🏘': house,
  '🏡': house,
  '🏪': shop,
  '🪜': ladder,
  '🗳': ballot,
  '🔗': link,
  '🔒': lock,
  '📣': megaphone,
  '💛': heart,
  '🤍': heart,
  '🎁': gift,
  '💌': mail,
  '📨': mail,
  '🔔': bell,
  '⏰': clock,
  '⏱': clock,
  '⏳': hourglass,
  '🍃': leaf,
  '🍂': leaf,
  '🌳': leaf,
  '🍽': utensils,
  '🍜': utensils,
  '🥪': utensils,
  '🍷': glass,
  '🍻': glass,
  '🌙': moon,
  '🌫': cloud,
  '🌤': sun,
  '🌊': wave,
  '👀': eye,
  '🌎': globe,
  '🌍': globe,
  '🎨': palette,
  '🎵': music,
  '🎬': film,
  '🏋': dumbbell,
  '🛋': sofa,
  '🧸': shapes,
  '💻': laptop,
  '♟': chess,
  '🔋': battery,
  '🪫': batteryLow,
  '😌': smile,
  '🙂': smile,
  '😍': smile,
  '☺': smile,
  '🙅': ban,
  '📡': signal,
  '🪞': mirror,
  '🔎': search,
  '📇': idCard,
  '⬇': arrowDown,
  '📭': inbox,
  '🎪': tent,
  '✏': pencil,
  '📌': pushpin,
  '📦': box,
  '💡': bulb,
  '🏞': mountain,
  '🌆': city,
  '✈': plane,
  '🧘': flower,
  '🤫': volumeOff,
  '💸': banknote,
};

/** Variation selectors and joiners carry no meaning for the lookup. */
function normalise(emoji: string): string {
  return emoji.replace(/[︎️‍]/g, '').trim();
}

/** Anything pictographic that has no drawn symbol of its own. */
const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** The first character of a string, so skin tones and sequences still match. */
function firstSymbol(value: string): string {
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    .segment(value)[Symbol.iterator]()
    .next().value?.segment;
  return first ?? value;
}

/** The drawn symbol for an emoji, or `null` when it is plain text such as "+". */
export function glyphFor(emoji: string | null | undefined): Shape | null {
  const clean = normalise(emoji ?? '');
  if (!clean) return null;
  const direct = MAP[clean] ?? MAP[normalise(firstSymbol(clean))];
  if (direct) return direct;
  return PICTOGRAPH.test(clean) ? spark : null;
}

interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** An emoji character, as stored in the database or written in a list. */
  emoji: string | null | undefined;
  size?: number;
}

/**
 * Renders the symbol for an emoji. Text that is not an emoji (a "+") is shown
 * as text, so callers can pass either without checking.
 */
export function Glyph({ emoji, size = 18, className, ...props }: GlyphProps) {
  const shape = glyphFor(emoji);
  if (!shape) {
    return emoji ? (
      <span aria-hidden className={className}>
        {emoji}
      </span>
    ) : null;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${className ?? ''}`}
      {...props}
    >
      {shape}
    </svg>
  );
}
