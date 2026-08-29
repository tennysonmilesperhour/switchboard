/**
 * The arithmetic behind "swipe a banner away".
 *
 * A notification banner sits at the top of the app under the status bar, so
 * the gestures that mean "go away" are up, left, and right — the three
 * directions that take it off-screen by the shortest route. Down is the one
 * direction that doesn't: it drags the banner further into the page, over the
 * content the reader is trying to see, so it's resisted rather than followed.
 *
 * This module is only geometry — no DOM, no React — because the interesting
 * part is the decisions (is this a swipe or a tap? did it travel far enough?
 * was it flicked?) and those are the part worth testing. The component in
 * `LiveNotifications` feeds it pointer coordinates and applies what comes back.
 */

/** The directions a banner can leave in. */
export type DismissDirection = 'up' | 'left' | 'right';

export interface SwipeConfig {
  /** The banner's width in px — a sideways swipe is judged against it. */
  width: number;
  /** The banner's height in px — an upward swipe is judged against it. */
  height: number;
}

export interface SwipeGesture {
  /** Horizontal travel since the finger went down. Positive is rightward. */
  dx: number;
  /** Vertical travel since the finger went down. Positive is downward. */
  dy: number;
  /** How long the gesture has lasted, in ms. Used to recognise a flick. */
  elapsedMs: number;
}

export interface SwipeFrame {
  /** Translation to apply to the banner, in px. */
  x: number;
  y: number;
  /** 1 at rest, fading toward 0 as the banner approaches the release point. */
  opacity: number;
}

export interface SwipeRelease extends SwipeFrame {
  /** The direction to fly out in, or null when the banner should spring back. */
  dismiss: DismissDirection | null;
}

/**
 * Below this, a gesture is a tap that wandered — the banner is a link, and
 * losing the tap because a thumb moved three pixels is worse than the swipe.
 */
export const TAP_SLOP_PX = 8;

/** A swipe must cross this share of the banner's own size to count as one. */
const TRAVEL_RATIO = 0.35;

/** …unless it was flicked: this fast, and a short travel still counts. */
const FLICK_PX_PER_MS = 0.5;

/** Even a flick has to have gone somewhere. */
const FLICK_MIN_PX = 24;

/** Downward drag follows the finger at this rate, so it reads as "stuck". */
const DOWNWARD_RESISTANCE = 0.25;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Which axis a gesture has committed to, or null while it's still a tap.
 *
 * The larger component wins, so a thumb sliding up-and-slightly-left doesn't
 * flicker between two axes mid-drag. Ties go to horizontal: a sideways swipe is
 * the one people try first on a card, and the vertical axis is shared with the
 * page's own scrolling.
 */
export function swipeAxis(gesture: Pick<SwipeGesture, 'dx' | 'dy'>): 'x' | 'y' | null {
  const { dx, dy } = gesture;
  if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) return null;
  return Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
}

/**
 * Where the banner should sit, and how solid it should look, mid-gesture.
 *
 * Sideways and upward travel are followed exactly — the banner should feel
 * attached to the finger. Downward travel is damped to a quarter, which reads
 * as resistance rather than as a broken control, and never fades the banner:
 * nothing about dragging down leads to a dismissal, so nothing about it should
 * look like one.
 */
export function swipeFrame(
  gesture: Pick<SwipeGesture, 'dx' | 'dy'>,
  config: SwipeConfig,
): SwipeFrame {
  const axis = swipeAxis(gesture);
  if (axis === null) return { x: 0, y: 0, opacity: 1 };

  if (axis === 'x') {
    const travel = Math.abs(gesture.dx) / Math.max(1, config.width);
    return { x: gesture.dx, y: 0, opacity: clamp01(1 - travel) };
  }

  if (gesture.dy > 0) {
    return { x: 0, y: gesture.dy * DOWNWARD_RESISTANCE, opacity: 1 };
  }

  const travel = Math.abs(gesture.dy) / Math.max(1, config.height);
  return { x: 0, y: gesture.dy, opacity: clamp01(1 - travel) };
}

/**
 * What to do when the finger lifts: fly the banner out, or spring it back.
 *
 * Two ways to earn a dismissal, because the two gestures people actually make
 * are different. A deliberate drag crosses a third of the banner and lets go;
 * a flick barely moves but moves fast. Requiring distance alone loses the
 * flick; requiring speed alone dismisses on a slow, careful drag that was
 * released early — usually a reader changing their mind.
 *
 * On dismissal the returned frame is the banner's exit position: fully
 * off-screen along the committed axis, and transparent.
 */
export function swipeRelease(gesture: SwipeGesture, config: SwipeConfig): SwipeRelease {
  const axis = swipeAxis(gesture);
  if (axis === null) return { x: 0, y: 0, opacity: 1, dismiss: null };

  const distance = axis === 'x' ? gesture.dx : gesture.dy;
  const extent = axis === 'x' ? config.width : config.height;
  const travelled = Math.abs(distance);
  const speed = gesture.elapsedMs > 0 ? travelled / gesture.elapsedMs : Infinity;

  // Down is never a dismissal, however hard it's thrown.
  if (axis === 'y' && distance > 0) return { x: 0, y: 0, opacity: 1, dismiss: null };

  const far = travelled >= extent * TRAVEL_RATIO;
  const flicked = speed >= FLICK_PX_PER_MS && travelled >= FLICK_MIN_PX;
  if (!far && !flicked) return { x: 0, y: 0, opacity: 1, dismiss: null };

  if (axis === 'x') {
    const direction: DismissDirection = distance > 0 ? 'right' : 'left';
    // A little past the edge, so the card is gone before the animation ends.
    const exit = (config.width + 32) * (distance > 0 ? 1 : -1);
    return { x: exit, y: 0, opacity: 0, dismiss: direction };
  }

  return { x: 0, y: -(config.height + 32), opacity: 0, dismiss: 'up' };
}
