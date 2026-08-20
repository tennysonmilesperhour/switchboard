import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_EDGE, targetDimensions } from '@/lib/client/downscale-image';

describe('targetDimensions', () => {
  it('leaves an image already within the limit untouched', () => {
    expect(targetDimensions(1200, 800, MAX_IMAGE_EDGE)).toEqual({ width: 1200, height: 800 });
    expect(targetDimensions(MAX_IMAGE_EDGE, 1000, MAX_IMAGE_EDGE)).toEqual({
      width: MAX_IMAGE_EDGE,
      height: 1000,
    });
  });

  it('scales the longest edge down to the limit and keeps the aspect ratio', () => {
    // A typical 12MP camera photo, landscape.
    const landscape = targetDimensions(4032, 3024, MAX_IMAGE_EDGE);
    expect(Math.max(landscape.width, landscape.height)).toBe(MAX_IMAGE_EDGE);
    expect(landscape.width / landscape.height).toBeCloseTo(4032 / 3024, 2);

    // A full-screen phone background, portrait — the case in the report.
    const portrait = targetDimensions(3024, 4032, MAX_IMAGE_EDGE);
    expect(Math.max(portrait.width, portrait.height)).toBe(MAX_IMAGE_EDGE);
    expect(portrait.width / portrait.height).toBeCloseTo(3024 / 4032, 2);
  });

  it('never scales up, and never rounds an edge to zero', () => {
    expect(targetDimensions(100, 40, MAX_IMAGE_EDGE)).toEqual({ width: 100, height: 40 });
    // An extreme banner: the short edge stays at least one pixel.
    const sliver = targetDimensions(10000, 3, MAX_IMAGE_EDGE);
    expect(sliver.width).toBe(MAX_IMAGE_EDGE);
    expect(sliver.height).toBeGreaterThanOrEqual(1);
  });

  it('treats a zero-sized source as nothing to do', () => {
    expect(targetDimensions(0, 0, MAX_IMAGE_EDGE)).toEqual({ width: 0, height: 0 });
  });
});
