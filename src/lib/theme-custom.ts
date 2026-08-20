/**
 * The custom appearance preset: three colors, one optional wallpaper, and a
 * derivation that keeps the result readable whatever gets picked.
 *
 * The four shipped presets in `themes-app.ts` are complete palettes — every
 * token written by hand, every contrast pair checked by `themes-app.test.ts`.
 * That approach does not survive contact with a color picker: somebody will
 * choose yellow, and "AA contrast, every combination" (AGENTS.md) has to hold
 * anyway. So the custom preset takes exactly three decisions —
 *
 *   - **background** — the color the app sits on,
 *   - **button** — the accent: buttons, links, the CTA gradient, selection,
 *   - **highlight** — rewards, stamps, the things the app wants you to notice,
 *
 * — and DERIVES the rest of the token layer from them: card and secondary
 * surfaces, three weights of ink, lines, the accent's deep/soft variants, the
 * acceptance and decline colors, the six plan colors, the gradient, and the
 * shadow set. Every derived value that carries text is pushed until it clears
 * its threshold, so an unreadable custom theme is not expressible. The three
 * inputs are the only thing stored; nobody can write a derived value.
 *
 * Two rules from `themes-app.ts` carry over unchanged:
 *
 * - **Semantics stay semantic.** `sage` still means available and accepted,
 *   `rose` still means declined. The picker does not offer them, because a
 *   theme changes the register, never the meaning. They are re-derived at the
 *   chosen saturation and register so they belong to the palette without
 *   ceasing to be green and red.
 * - **Every token, completely.** A half-swapped palette is how a theme ends up
 *   unreadable in the one corner nobody opened. `customThemeVars` returns the
 *   whole set or none of it.
 *
 * The wallpaper is composited under everything, behind a scrim of the
 * background color. The scrim is not decoration: text sits directly on the page
 * background all over this app, and an arbitrary photograph behind it is an
 * arbitrary contrast ratio. So the strength slider does not set an opacity — it
 * sets a request, and the derivation solves the ink weights and the image share
 * together, giving back as much image as still leaves the type readable against
 * the worst pixel a photograph can contain. Choosing a background with contrast
 * to spare is what buys a bolder wallpaper.
 */

/** The stored shape. Three colors, a wallpaper, and how much of it shows. */
export interface CustomAppearance {
  /** A public URL in one of our own storage buckets, or null for no image. */
  wallpaper: string | null;
  /** The page background. */
  background: string;
  /** The accent: buttons, links, the CTA gradient. */
  button: string;
  /** Rewards, stamps, the things worth noticing. */
  highlight: string;
  /**
   * How much of the wallpaper shows through, 0-100. Clamped at render time to
   * whatever the palette's contrast headroom actually allows.
   */
  wallpaperStrength: number;
}

export const DEFAULT_CUSTOM: CustomAppearance = {
  wallpaper: null,
  background: '#f9fbfd',
  button: '#f82a63',
  highlight: '#eeae36',
  wallpaperStrength: 60,
};

/** Buckets a wallpaper may be served from — all public, all ours. */
const WALLPAPER_BUCKETS = ['covers', 'media', 'avatars'];

const HEX = /^#[0-9a-f]{6}$/i;

// ————————————————————————— color primitives —————————————————————————

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function srgbChannel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (
    0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
  );
}

/** WCAG contrast ratio, 1:1 to 21:1. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Blend `share` of `b` into `a`, in sRGB — the same space a browser composites in. */
export function mix(a: string, b: string, share: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const t = Math.min(1, Math.max(0, share));
  return toHex([
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  ]);
}

/** Hue in degrees, saturation and lightness in 0-1. */
export function rgbToHsl(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return toHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let v = t;
    if (v < 0) v += 1;
    if (v > 1) v -= 1;
    if (v < 1 / 6) return p + (q - p) * 6 * v;
    if (v < 1 / 2) return q;
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
    return p;
  };
  return toHex([
    channel(hue + 1 / 3) * 255,
    channel(hue) * 255,
    channel(hue - 1 / 3) * 255,
  ]);
}

/** The worst contrast `color` achieves against any of `backgrounds`. */
function worstContrast(color: string, backgrounds: string[]): number {
  return backgrounds.reduce(
    (worst, bg) => Math.min(worst, contrast(color, bg)),
    Number.POSITIVE_INFINITY,
  );
}

/**
 * Push `color` toward `extreme` (black or white) until it clears `target`
 * against every background, and no further. Returns `color` untouched when it
 * already clears, and the extreme itself when even that cannot reach.
 */
function pushToward(
  color: string,
  extreme: string,
  backgrounds: string[],
  target: number,
): string {
  if (worstContrast(color, backgrounds) >= target) return color;
  if (worstContrast(extreme, backgrounds) < target) return extreme;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i += 1) {
    const midpoint = (low + high) / 2;
    if (worstContrast(mix(color, extreme, midpoint), backgrounds) >= target) {
      high = midpoint;
    } else {
      low = midpoint;
    }
  }
  return mix(color, extreme, high);
}

const OPPOSITE: Record<string, string> = { '#000000': '#ffffff', '#ffffff': '#000000' };

/**
 * Deepen a color until white text reads on it, and no further.
 *
 * For the tokens that are FILLS with `text-white` written into the component —
 * the primary button, the accent badge, the success button. The label is not a
 * token, so the theme cannot meet the pair halfway; the fill has to carry it.
 */
function whiteReadable(color: string): string {
  // A hair over 4.5, because every one of these values is rounded to 8-bit hex
  // on the way out and a result sitting exactly on the threshold can round
  // under it — as the gradient's middle stop, blended from two colors each just
  // clearing, promptly did.
  return pushToward(color, '#000000', ['#ffffff'], 4.55);
}

/**
 * The contrast a pure extreme must have with a surface before we are willing to
 * put text on it.
 *
 * Every text color in this file is produced by pushing something toward black
 * or toward white, so whatever the extreme achieves is the ceiling. Holding
 * surfaces above 4.6:1 against the extreme — a hair over the 4.5 the text needs
 * — is what makes "readable by construction" true rather than hopeful.
 */
const SURFACE_HEADROOM = 4.6;

/** The luminance a surface must stay above (black text) or below (white text). */
function surfaceLuminanceLimit(inkExtreme: string): number {
  // From (L + 0.05) / 0.05 >= 4.6 for black, and 1.05 / (L + 0.05) >= 4.6 for white.
  return inkExtreme === '#000000'
    ? SURFACE_HEADROOM * 0.05 - 0.05
    : 1.05 / SURFACE_HEADROOM - 0.05;
}

/**
 * Nudge a surface `step` of the way toward `direction`, unless that would take
 * it into the band where the ink extreme cannot reach 4.5:1 — in which case it
 * goes the other way instead.
 *
 * Surfaces are what make this palette safe. Body ink is guaranteed at least
 * ~4.58:1 against ANY background (black and white cannot both fail: their
 * contrast ratios against a given color always multiply to 21), so a page color
 * is always workable on its own. Cards, secondary surfaces and tinted chips are
 * where that breaks: derive them freely and you get a set spread across the
 * luminance range with no single text color that reads on all of them. Keeping
 * every surface on the ink's side of the limit is what stops that.
 */
function safeSurface(
  base: string,
  direction: string,
  step: number,
  inkExtreme: string,
): string {
  const candidate = mix(base, direction, step);
  if (contrast(inkExtreme, candidate) >= SURFACE_HEADROOM) return candidate;
  return mix(base, OPPOSITE[direction], step);
}

/**
 * Make `color` legible on every background by pushing it toward the ink's
 * extreme — the direction the whole palette's text moves in, so an accent used
 * as text goes deeper on a light theme and brighter on a dark one.
 */
function readableOn(
  color: string,
  backgrounds: string[],
  target: number,
  inkExtreme: string,
): string {
  return pushToward(color, inkExtreme, backgrounds, target);
}

// ————————————————————————— validation —————————————————————————

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
}

/**
 * A wallpaper reference we are willing to render.
 *
 * Two independent things are being checked, and it is worth being precise about
 * which does what, because an earlier version of this got the first one wrong:
 *
 * 1. **The origin has to be our own storage.** This value is stored on a profile
 *    and then fetched by the browser as a `background-image` on every page, on
 *    every device the account signs into, for as long as it stays set. An
 *    attacker-chosen origin is therefore not a one-off request but durable
 *    beaconing that outlives whatever foothold set it. RLS means someone can
 *    only ever write their own row, so this is post-compromise persistence
 *    rather than a cross-user attack — which is still worth closing, and cheap.
 *
 *    Matching the bucket path as a substring is NOT this check: anyone can
 *    serve `https://attacker.example/storage/v1/object/public/covers/…`. The
 *    origin is compared against the configured Supabase project, and the path is
 *    anchored to `pathname` so a query string or fragment cannot carry it.
 *
 * 2. **The characters have to be safe for the CSS sink.** The URL ends up inside
 *    a `url("…")` token in a style attribute, so a quote or paren could close
 *    the token and add a second declaration. That is a real constraint rather
 *    than a backstop, and the closed character set below is what enforces it.
 *
 * Fails closed when the project URL is unset or unparseable: no wallpaper is a
 * far better answer than an unverified one.
 */
export function isWallpaperUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return false;
  if (/["'()\\<>\s;]/.test(value)) return false;

  const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!project) return false;

  let url: URL;
  let projectOrigin: string;
  try {
    url = new URL(value);
    projectOrigin = new URL(project).origin;
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;
  // `origin` folds in scheme, host and port, and — unlike a string prefix —
  // cannot be spoofed by userinfo (`https://ours@evil.tld/`) or a lookalike
  // subdomain, because `new URL` has already resolved those.
  if (url.origin !== projectOrigin) return false;
  if (url.search || url.hash) return false;
  // Decoded once by `new URL`, so a `%2e%2e` traversal is a literal `..` here.
  if (url.pathname.includes('..')) return false;

  return new RegExp(
    `^/storage/v1/object/public/(?:${WALLPAPER_BUCKETS.join('|')})/[^/]+/.+$`,
  ).test(url.pathname);
}

/**
 * Canonicalise a stored wallpaper reference, then validate it.
 *
 * The upload route hands back the object's public URL with a cache-busting
 * `?v=<timestamp>` query appended, and `isWallpaperUrl` — the CSS-sink
 * validator — deliberately refuses any URL carrying a query or fragment. Left
 * unreconciled the two disagree: the exact URL the picker is handed is the one
 * the save throws away, so a wallpaper someone just chose is silently dropped
 * to null and never persists past the settings page.
 *
 * Dropping everything from the first `?` or `#` before validating resolves it
 * without loosening the validator. The query is not part of which object this
 * is — the storage path is already unique — so the cleaned URL points at the
 * same image; an attacker URL still fails the origin and path checks on that
 * cleaned value (a foreign host with our path in its query collapses to the
 * foreign origin); and the stored reference stays a bare `url("…")`.
 */
function wallpaperReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.split(/[?#]/)[0];
  return isWallpaperUrl(clean) ? clean : null;
}

/**
 * Read a stored `appearance_custom` value into something renderable.
 *
 * Fail-safe per field rather than all-or-nothing: a row can outlive the deploy
 * that wrote it, and a person who once set a wallpaper that no longer validates
 * should get their colors back, not the stock theme with no explanation.
 */
export function parseCustomAppearance(value: unknown): CustomAppearance {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const strength = Number(raw.wallpaperStrength);
  return {
    wallpaper: wallpaperReference(raw.wallpaper),
    background: color(raw.background, DEFAULT_CUSTOM.background),
    button: color(raw.button, DEFAULT_CUSTOM.button),
    highlight: color(raw.highlight, DEFAULT_CUSTOM.highlight),
    wallpaperStrength: Number.isFinite(strength)
      ? Math.min(100, Math.max(0, Math.round(strength)))
      : DEFAULT_CUSTOM.wallpaperStrength,
  };
}

// ————————————————————————— derivation —————————————————————————

/**
 * How far each ink weight is relaxed toward the page before it stops being
 * readable, and how far it must still be relaxed for the hierarchy to survive.
 *
 * Body ink is a near-extreme. Secondary and faint ink are that ink blended back
 * toward the page — that blend IS the hierarchy, and a wallpaper eats it: the
 * more image shows through the background, the less room there is to relax
 * before a weight stops clearing its threshold. Left unbounded the two lighter
 * weights collapse onto body ink and the page goes flat, technically legible
 * and visually mush. So each weight has a floor as well as a target, and a
 * strength that would push a weight past its floor is a strength this palette
 * cannot afford.
 */
const INK_WEIGHTS = {
  soft: { target: 4.5, most: 0.36, floor: 0.18 },
  faint: { target: 3, most: 0.56, floor: 0.34 },
} as const;

/**
 * Which extreme this page's text is made from.
 *
 * Black and white cannot both fail against the same color: their contrast
 * ratios with any given background multiply to exactly 21, so the better of the
 * two is never worse than √21 ≈ 4.58:1. Picking the better one is therefore not
 * a heuristic — it is the step that makes AA on the page background hold for
 * every color a person can choose, including the mid-tones where neither
 * extreme has much room.
 */
function inkExtremeFor(paper: string): string {
  return contrast('#ffffff', paper) > contrast('#000000', paper) ? '#ffffff' : '#000000';
}

/** The largest blend of `ink` back toward `paper` that still clears `target`. */
function relaxMost(
  ink: string,
  paper: string,
  backgrounds: string[],
  target: number,
  most: number,
): number {
  if (worstContrast(mix(ink, paper, most), backgrounds) >= target) return most;
  let low = 0;
  let high = most;
  for (let i = 0; i < 16; i += 1) {
    const midpoint = (low + high) / 2;
    if (worstContrast(mix(ink, paper, midpoint), backgrounds) >= target) low = midpoint;
    else high = midpoint;
  }
  return low;
}

/**
 * The three weights of ink for a given wallpaper share — legible on every
 * surface the app puts text on, including the page background with the worst
 * possible image pixel showing through it. Always returns a palette; whether
 * that palette is good enough is `inksAreGoodEnough`'s question.
 */
function inksAt(surfaces: string[], paper: string, share: number) {
  // Every surface the app puts text on — page, card, secondary, and each tinted
  // chip — plus the page background with the worst wallpaper pixel showing
  // through it. A luminance extreme bounds every image there is, so compositing
  // pure black and pure white at `share` covers all of them.
  //
  // The tinted surfaces belong in this list and were once missing from it. Body
  // and secondary ink go on them constantly (`Card tone="gold"`, the perk rows,
  // any paragraph inside a toned card), and solving the inks against the plain
  // surfaces alone left `text-ink-soft` at 1.7:1 on a dark theme's gold-soft
  // while every pair the tests checked stayed green.
  const backgrounds = [
    ...surfaces,
    mix(paper, '#000000', share),
    mix(paper, '#ffffff', share),
  ];

  const extreme = inkExtremeFor(paper);
  // A tinted near-extreme, pushed the rest of the way if the wallpaper composite
  // asks for it. Which extreme this is — light ink or dark ink — is what "dark
  // theme" actually means here, and it is measured from the page, not assumed.
  const ink = pushToward(mix(paper, extreme, 0.9), extreme, backgrounds, 4.5);

  const softT = relaxMost(
    ink, paper, backgrounds, INK_WEIGHTS.soft.target, INK_WEIGHTS.soft.most,
  );
  const faintT = relaxMost(
    ink, paper, backgrounds, INK_WEIGHTS.faint.target, INK_WEIGHTS.faint.most,
  );

  return {
    ink,
    inkSoft: mix(ink, paper, softT),
    inkFaint: mix(ink, paper, faintT),
    inkContrast: worstContrast(ink, backgrounds),
    softT,
    faintT,
  };
}

/** Readable at AA on every surface, and still legible AS a hierarchy. */
function inksAreGoodEnough(inks: ReturnType<typeof inksAt>): boolean {
  return (
    inks.inkContrast >= 4.5 &&
    inks.softT >= INK_WEIGHTS.soft.floor &&
    inks.faintT >= INK_WEIGHTS.faint.floor
  );
}

/**
 * How much wallpaper this appearance can actually afford to show, 0-1.
 *
 * This is the point of solving the inks and the strength together: the image is
 * not dimmed to some fixed opacity chosen once for everybody, it is dimmed to
 * exactly where the type still works. A background with contrast to spare buys
 * a bolder wallpaper; a mid-gray one has nothing to spend and gets almost none.
 */
function affordableShare(surfaces: string[], paper: string, wanted: number): number {
  if (wanted <= 0) return 0;
  if (inksAreGoodEnough(inksAt(surfaces, paper, wanted))) return wanted;
  let low = 0;
  let high = wanted;
  for (let i = 0; i < 14; i += 1) {
    const midpoint = (low + high) / 2;
    if (inksAreGoodEnough(inksAt(surfaces, paper, midpoint))) low = midpoint;
    else high = midpoint;
  }
  // Quantised down so the alpha written into the scrim is exact: the guarantee
  // is only as good as the number that reaches the browser.
  return Math.floor(low * 1000) / 1000;
}

/** The color with `hue` and `saturation` whose luminance is closest to `target`. */
function atLuminance(hue: number, saturation: number, target: number): string {
  // Luminance rises monotonically with HSL lightness at a fixed hue and
  // saturation, so this converges without caring which hue it is working in.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i += 1) {
    const midpoint = (low + high) / 2;
    if (luminance(hslToHex(hue, saturation, midpoint)) < target) low = midpoint;
    else high = midpoint;
  }
  return hslToHex(hue, saturation, (low + high) / 2);
}

/**
 * A tinted surface — the quiet background a colored label sits on: the accent's
 * `-soft`, acceptance green's, decline red's.
 *
 * Built by luminance rather than by blending the tint into the card, because
 * HSL lightness and perceived luminance are not the same thing: a saturated
 * blue at "58% lightness" is as dark as a mid-gray. Blending moves a surface as
 * far as its tint happens to be dark, which scatters the surfaces across the
 * luminance range and leaves no single text color that reads on all of them —
 * exactly how "accent text on its own surface" lands at 4.1:1 while every other
 * pair in the palette is fine. Here the hue varies and the band does not.
 */
function tintedSurface(card: string, tint: string, inkExtreme: string): string {
  const [hue, saturation] = rgbToHsl(tint);
  const base = luminance(card);
  const limit = surfaceLuminanceLimit(inkExtreme);
  // A step toward the ink, so the surface reads as a tint of the card rather
  // than another card — but a step PROPORTIONAL to the card, not a fixed
  // fraction of the way to the extreme.
  //
  // That distinction is the whole of it. `base + (1 - base) * 0.2` looks like a
  // small nudge and is one on a light theme, where `base` is near 1; on a dark
  // theme, where `base` is 0.02, it is a jump to a mid-tone — a surface eight
  // times lighter than the card it is supposedly a tint of. Body ink then has
  // to be legible on a page at 0.02 and a chip at 0.22 at once, which is what
  // put `text-ink-soft` at 1.7:1 on Dusk-like themes. The shipped dark preset
  // does the obvious thing instead: `--color-gold-soft: #33271a` against a card
  // of `#2a211a`, barely a shade apart. This now does the same.
  const target =
    inkExtreme === '#000000'
      ? Math.max(limit, base * 0.86)
      : Math.min(limit, base * 1.6 + 0.008);
  return atLuminance(hue, Math.min(0.55, Math.max(0.12, saturation * 0.5)), target);
}

/**
 * Six plan-card colors — one accent per plan, so a wall of plans reads as a
 * wall of distinct things rather than one repeated thing.
 *
 * Anchored on the two chosen hues and spread over the rest of the wheel from
 * there. Walking only the arc *between* the two would be more obedient and
 * quite wrong: pick a pink button and an amber highlight and all six land in
 * the same warm sixth of the circle, which is a gradient, not a palette. Both
 * choices appear, everything else fills the gap evenly, and saturation and
 * lightness come from the accent so the family holds together.
 */
function planPalette(button: string, highlight: string, dark: boolean): string[] {
  const [buttonHue, buttonSat] = rgbToHsl(button);
  const [highlightHue] = rgbToHsl(highlight);
  let offset = (((highlightHue - buttonHue) % 360) + 360) % 360;
  // Two hues this close together are one hue; nudge so the six stay distinct.
  if (offset < 20 || offset > 340) offset = 60;

  // Both anchors, then the remaining four spread over BOTH arcs the anchors cut
  // the wheel into, each arc getting hues in proportion to its length.
  //
  // Filling only the arc above `offset` — which is what this did — quietly
  // depends on the highlight sitting clockwise of the button. Put it the other
  // way round and the whole palette crowds into the short arc that is left:
  // Switchboard's own two colors in the opposite roles (button #eeae36,
  // highlight #f82a63, offset ~303) produced six oranges 11 degrees apart, a
  // gradient rather than a palette. The same two colors in the shipped order
  // spread over 56 degrees, which is why it looked fine.
  const arcs = [
    { start: 0, length: offset },
    { start: offset, length: 360 - offset },
  ];
  const total = 360;
  const hues = [0, offset];
  for (const arc of arcs) {
    const count = Math.round((arc.length / total) * 4);
    for (let i = 1; i <= count && hues.length < 6; i += 1) {
      hues.push(arc.start + (arc.length * i) / (count + 1));
    }
  }
  // Rounding can leave the pair one short; fall back to the wider arc's midpoint.
  while (hues.length < 6) {
    const widest = arcs[0].length > arcs[1].length ? arcs[0] : arcs[1];
    hues.push(widest.start + widest.length * (hues.length / 8 + 0.5));
  }
  const saturation = Math.min(0.85, Math.max(0.45, buttonSat));
  const lightness = dark ? 0.54 : 0.46;
  // Plan cards are a full-bleed color with white type over it, so these are
  // fills under `text-white` like the accent is. The card's gradient lightens
  // the top by 18%, which the large display title can carry at AA's large-text
  // threshold — but only from a base white actually reads on.
  return hues.map((hue) =>
    whiteReadable(hslToHex(buttonHue + hue, saturation, lightness)),
  );
}

/**
 * Everything the token layer needs, solved together: the surfaces, the three
 * inks, and how much wallpaper the result can carry.
 */
function derive(custom: CustomAppearance) {
  const paper = custom.background;
  const extreme = inkExtremeFor(paper);
  const dark = extreme === '#ffffff';

  // Cards lift off the page: toward white, on a dark theme as much as a light
  // one, because a card that goes darker than its page reads as a hole rather
  // than a surface. `safeSurface` sends it the other way in the one case where
  // lifting it would put it in the band the ink cannot read on — a mid-tone
  // page, where a slightly lighter card is the difference between 4.6:1 and
  // 4.3:1 and there is nothing else to give.
  const card = safeSurface(paper, '#ffffff', dark ? 0.09 : 0.62, extreme);
  const cream = safeSurface(paper, dark ? '#ffffff' : '#000000', 0.05, extreme);

  // The tinted chips are surfaces too, so they are derived HERE — before the
  // inks — and handed to the ink solver along with the plain ones. They depend
  // only on the card and the ink direction, so there is no ordering problem;
  // deriving them afterwards (as this once did) simply left them out of the
  // constraint set, and body text on a toned card was unreadable as a result.
  const [, buttonSaturation] = rgbToHsl(custom.button);
  const semanticSaturation = Math.min(0.7, Math.max(0.34, buttonSaturation));
  const sage = whiteReadable(hslToHex(158, semanticSaturation, dark ? 0.42 : 0.34));
  const rose = hslToHex(352, semanticSaturation, dark ? 0.62 : 0.42);

  const accentSoft = tintedSurface(card, custom.button, extreme);
  const goldSoft = tintedSurface(card, custom.highlight, extreme);
  const sageSoft = tintedSurface(card, sage, extreme);
  const roseSoft = tintedSurface(card, rose, extreme);

  const surfaces = [paper, card, cream, accentSoft, goldSoft, sageSoft, roseSoft];

  const wanted = custom.wallpaper ? custom.wallpaperStrength / 100 : 0;
  const share = affordableShare(surfaces, paper, wanted);

  return {
    paper,
    card,
    cream,
    dark,
    extreme,
    share,
    sage,
    rose,
    accentSoft,
    goldSoft,
    sageSoft,
    roseSoft,
    ...inksAt(surfaces, paper, share),
  };
}

/**
 * The complete token override for a custom appearance, as CSS custom
 * properties, applied as an inline `style` on `<html>`.
 *
 * On the server that style object is SERIALISED INTO A STYLE ATTRIBUTE, so
 * these values really are parsed as CSS — an earlier version of this comment
 * claimed the opposite, on the strength of the client path where React sets
 * each property through `style.setProperty`. What actually makes it safe is
 * that nothing free-form gets in: every colour is validated to `#rrggbb` by
 * `parseCustomAppearance`, the gradient and scrim are built here from those
 * validated colours, and the only caller-supplied string — the wallpaper URL —
 * is held to a closed character set by `isWallpaperUrl` precisely because it
 * lands inside a `url("…")` token. React's attribute escaping is the backstop,
 * not the control.
 */
export function customThemeVars(custom: CustomAppearance): Record<string, string> {
  const {
    paper, card, cream, dark, extreme, share,
    ink, inkSoft, inkFaint,
    sage, rose, accentSoft, goldSoft, sageSoft, roseSoft,
  } = derive(custom);
  const line = mix(paper, ink, dark ? 0.22 : 0.16);

  // The accent is a FILL, and 18 places in the app put `text-white` on it —
  // `bg-terracotta text-white`, the primary Button, the notification badge. The
  // label color is written into those components, not read from a token, so the
  // fill is the only end of that pair the theme controls: it gets deepened, by
  // exactly as much as white needs and no more. Somebody who picks a pale
  // yellow "button color" gets a deeper yellow button, not an unreadable one.
  const accent = whiteReadable(custom.button);

  // The `-deep` tokens are the same colors used as TEXT. Every one of them is
  // solved against the page as well as the card and its own tinted surface:
  // `text-rose-deep` and friends appear on bare page background (the discover
  // form's errors, for one), and leaving `paper` out of a list — which is
  // exactly what three of these four used to do — is invisible in every test
  // that only checks a label on its own chip, and lands at 1.9:1 on a mid-tone
  // page.
  const on = (color: string, own: string) =>
    readableOn(color, [card, paper, cream, own], 4.5, extreme);

  const accentDeep = on(accent, accentSoft);
  const goldDeep = on(custom.highlight, goldSoft);
  // Semantics, re-registered. Green still means accepted and red still means
  // declined; only their saturation and lightness follow the theme (both are
  // derived in `derive`, because their tinted surfaces have to exist before the
  // inks are solved). Green is a fill under white text too — the primary
  // Button's success variant — so it is deepened like the accent rather than
  // lightened on a dark page: a colored button on a dark page is still a
  // colored button.
  const sageDeep = on(sage, sageSoft);
  const roseDeep = on(rose, roseSoft);

  const gradientEnd = whiteReadable(custom.highlight);

  const [pink, purple, blue, jade, orange, magenta] = planPalette(
    custom.button,
    custom.highlight,
    dark,
  );

  const [pr, pg, pb] = parseHex(paper);

  const vars: Record<string, string> = {
    '--color-paper': paper,
    '--color-cream': cream,
    '--color-card': card,
    '--color-ink': ink,
    '--color-ink-soft': inkSoft,
    '--color-ink-faint': inkFaint,
    '--color-line': line,

    '--color-terracotta': accent,
    '--color-terracotta-deep': accentDeep,
    '--color-terracotta-soft': accentSoft,

    '--color-sage': sage,
    '--color-sage-deep': sageDeep,
    '--color-sage-soft': sageSoft,

    '--color-gold': custom.highlight,
    '--color-gold-soft': goldSoft,
    '--color-gold-deep': goldDeep,

    '--color-rose-soft': roseSoft,
    '--color-rose-deep': roseDeep,

    '--color-plan-pink': pink,
    '--color-plan-purple': purple,
    '--color-plan-blue': blue,
    '--color-plan-jade': jade,
    '--color-plan-orange': orange,
    '--color-plan-magenta': magenta,

    // The signature CTA gradient, on which every call to action puts white
    // text. Both stops are deepened for the same reason the accent fill is.
    '--brand-gradient': `linear-gradient(96deg, ${accent} 0%, ${whiteReadable(
      mix(accent, gradientEnd, 0.5),
    )} 55%, ${gradientEnd} 120%)`,

    // The scrim is the page background at whatever opacity leaves the text
    // alone; `share` is how much wallpaper shows through it.
    '--wallpaper-scrim': `rgba(${pr}, ${pg}, ${pb}, ${(1 - share).toFixed(3)})`,
  };

  // Unused when the surfaces are light, but a dark custom theme needs the same
  // heavier shadows the Dusk preset uses — a light-theme shadow is invisible
  // against a dark page, and every card loses its edge.
  if (dark) {
    vars['--shadow-lift'] = '0 2px 5px rgb(0 0 0 / 0.4), 0 1px 2px rgb(0 0 0 / 0.3)';
    vars['--shadow-float'] = '0 8px 28px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.35)';
    vars['--shadow-card'] =
      '0 2px 5px rgb(0 0 0 / 0.45), inset 0 -10px 14px rgb(0 0 0 / 0.15)';
  }

  if (share > 0 && custom.wallpaper) vars['--wallpaper'] = `url("${custom.wallpaper}")`;

  return vars;
}

/**
 * How much of the wallpaper actually shows, 0-1, after clamping to what the
 * palette can carry. Settings shows this so a slider that stops moving is
 * explained rather than mysterious.
 */
export function wallpaperShare(custom: CustomAppearance): number {
  return derive(custom).share;
}

/** True when this appearance has an image that will actually be visible. */
export function hasWallpaper(custom: CustomAppearance): boolean {
  return Boolean(custom.wallpaper) && wallpaperShare(custom) > 0;
}
