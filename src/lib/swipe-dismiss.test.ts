import { describe, it, expect } from 'vitest';
import {
  TAP_SLOP_PX,
  swipeAxis,
  swipeFrame,
  swipeRelease,
  type SwipeConfig,
} from './swipe-dismiss';

const BANNER: SwipeConfig = { width: 400, height: 72 };

describe('swipeAxis', () => {
  it('treats a gesture inside the slop as a tap, not a swipe', () => {
    expect(swipeAxis({ dx: 0, dy: 0 })).toBeNull();
    expect(swipeAxis({ dx: TAP_SLOP_PX - 1, dy: TAP_SLOP_PX - 1 })).toBeNull();
  });

  it('commits to whichever axis moved further', () => {
    expect(swipeAxis({ dx: 40, dy: 5 })).toBe('x');
    expect(swipeAxis({ dx: -40, dy: 5 })).toBe('x');
    expect(swipeAxis({ dx: 5, dy: -40 })).toBe('y');
  });

  it('gives a diagonal tie to horizontal, so the axis cannot flicker mid-drag', () => {
    expect(swipeAxis({ dx: 30, dy: -30 })).toBe('x');
  });
});

describe('swipeFrame', () => {
  it('leaves the banner alone until the gesture clears the tap slop', () => {
    expect(swipeFrame({ dx: 3, dy: 2 }, BANNER)).toEqual({ x: 0, y: 0, opacity: 1 });
  });

  it('follows the finger sideways and fades with distance', () => {
    const frame = swipeFrame({ dx: 100, dy: 0 }, BANNER);
    expect(frame.x).toBe(100);
    expect(frame.y).toBe(0);
    expect(frame.opacity).toBeCloseTo(0.75);
  });

  it('follows the finger upward and fades with distance', () => {
    const frame = swipeFrame({ dx: 0, dy: -36 }, BANNER);
    expect(frame.y).toBe(-36);
    expect(frame.opacity).toBeCloseTo(0.5);
  });

  it('resists a downward drag and never fades it', () => {
    const frame = swipeFrame({ dx: 0, dy: 100 }, BANNER);
    expect(frame.y).toBe(25);
    expect(frame.opacity).toBe(1);
  });

  it('never reports a negative opacity, however far the swipe goes', () => {
    expect(swipeFrame({ dx: 5000, dy: 0 }, BANNER).opacity).toBe(0);
    expect(swipeFrame({ dx: 0, dy: -5000 }, BANNER).opacity).toBe(0);
  });

  it('survives a zero-sized banner rather than dividing by it', () => {
    const frame = swipeFrame({ dx: 50, dy: 0 }, { width: 0, height: 0 });
    expect(Number.isFinite(frame.opacity)).toBe(true);
    expect(frame.opacity).toBe(0);
  });
});

describe('swipeRelease', () => {
  it('springs back a gesture that never left the tap slop', () => {
    expect(swipeRelease({ dx: 2, dy: 2, elapsedMs: 90 }, BANNER)).toEqual({
      x: 0,
      y: 0,
      opacity: 1,
      dismiss: null,
    });
  });

  it('springs back a slow drag released before a third of the way', () => {
    const release = swipeRelease({ dx: 60, dy: 0, elapsedMs: 900 }, BANNER);
    expect(release.dismiss).toBeNull();
    expect(release).toMatchObject({ x: 0, y: 0, opacity: 1 });
  });

  it('dismisses sideways once a third of the width is crossed', () => {
    expect(swipeRelease({ dx: 141, dy: 0, elapsedMs: 900 }, BANNER).dismiss).toBe('right');
    expect(swipeRelease({ dx: -141, dy: 0, elapsedMs: 900 }, BANNER).dismiss).toBe('left');
  });

  it('dismisses upward once a third of the height is crossed', () => {
    expect(swipeRelease({ dx: 0, dy: -30, elapsedMs: 900 }, BANNER).dismiss).toBe('up');
  });

  it('dismisses a short, fast flick that never travelled a third', () => {
    // 40px in 40ms: 1px/ms, well past a flick, but a tenth of the width.
    expect(swipeRelease({ dx: 40, dy: 0, elapsedMs: 40 }, BANNER).dismiss).toBe('right');
  });

  it('does not count a fast twitch inside the slop as a flick', () => {
    expect(swipeRelease({ dx: 6, dy: 0, elapsedMs: 4 }, BANNER).dismiss).toBeNull();
  });

  it('does not count a fast-but-tiny move past the slop as a flick', () => {
    // Past the tap slop and quick, but 12px is not a gesture anyone meant.
    expect(swipeRelease({ dx: 12, dy: 0, elapsedMs: 10 }, BANNER).dismiss).toBeNull();
  });

  it('never dismisses downward, however hard it is thrown', () => {
    expect(swipeRelease({ dx: 0, dy: 300, elapsedMs: 60 }, BANNER).dismiss).toBeNull();
    expect(swipeRelease({ dx: 0, dy: 300, elapsedMs: 60 }, BANNER).y).toBe(0);
  });

  it('exits past the edge it left by, so no sliver is left behind', () => {
    const right = swipeRelease({ dx: 200, dy: 0, elapsedMs: 300 }, BANNER);
    expect(right.x).toBeGreaterThan(BANNER.width);
    expect(right.opacity).toBe(0);

    const left = swipeRelease({ dx: -200, dy: 0, elapsedMs: 300 }, BANNER);
    expect(left.x).toBeLessThan(-BANNER.width);

    const up = swipeRelease({ dx: 0, dy: -60, elapsedMs: 300 }, BANNER);
    expect(up.y).toBeLessThan(-BANNER.height);
  });

  it('treats an instantaneous gesture as a flick rather than dividing by zero', () => {
    const release = swipeRelease({ dx: 40, dy: 0, elapsedMs: 0 }, BANNER);
    expect(release.dismiss).toBe('right');
  });
});
