import { describe, expect, it } from 'vitest';
import { paletteFromPixels, type ExtractedPalette } from '@/lib/image-palette';
import { contrast, luminance, rgbToHsl } from '@/lib/theme-custom';

const FALLBACK: ExtractedPalette = {
  background: '#f9fbfd',
  button: '#f82a63',
  highlight: '#eeae36',
};

/** An image made of the given colors, in the given proportions. */
function image(parts: Array<[string, number]>): Uint8ClampedArray {
  const pixels: number[] = [];
  for (const [hex, count] of parts) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < count; i += 1) pixels.push(r, g, b, 255);
  }
  return new Uint8ClampedArray(pixels);
}

function hue(hex: string): number {
  return rgbToHsl(hex)[0];
}

describe('paletteFromPixels', () => {
  it('takes the page color from what the picture is mostly made of', () => {
    const palette = paletteFromPixels(
      image([
        ['#123f7a', 800], // a deep blue sky, most of the frame
        ['#e8b04b', 120],
        ['#c0392b', 80],
      ]),
      FALLBACK,
    );
    // Same family as the dominant color…
    expect(Math.abs(hue(palette.background) - hue('#123f7a'))).toBeLessThan(30);
    // …but pushed to an extreme, because a mid-tone page has no contrast to
    // spend on either the text or the wallpaper.
    expect(luminance(palette.background)).toBeLessThan(luminance('#123f7a'));
  });

  /**
   * Picking by frequency alone returns gray from every photograph — sky,
   * shadow and skin are most of most pictures. The accents have to come from
   * what is actually vivid, however little of it there is.
   */
  it('takes the accents from what is vivid, not from what is common', () => {
    const palette = paletteFromPixels(
      image([
        ['#8a8a8a', 2000], // overwhelming, and completely uninteresting
        ['#0f0f0f', 900],
        ['#e03a2f', 60], // a red door
        ['#2e8b57', 40], // a green awning
      ]),
      FALLBACK,
    );
    expect(Math.abs(hue(palette.button) - hue('#e03a2f'))).toBeLessThan(20);
    expect(Math.abs(hue(palette.highlight) - hue('#2e8b57'))).toBeLessThan(20);
  });

  it('keeps the highlight a real distance from the button', () => {
    // One-color image: the highlight has to be invented rather than repeated,
    // or "highlighted" and "ordinary" become the same color.
    const palette = paletteFromPixels(image([['#3355dd', 1000]]), FALLBACK);
    const separation = Math.abs(hue(palette.button) - hue(palette.highlight));
    expect(Math.min(separation, 360 - separation)).toBeGreaterThan(20);
  });

  it('gives back the fallback for a picture with no colors in it', () => {
    expect(paletteFromPixels(new Uint8ClampedArray([]), FALLBACK)).toEqual(FALLBACK);
    // Fully transparent pixels are not part of the picture.
    const clear = new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0]);
    expect(paletteFromPixels(clear, FALLBACK)).toEqual(FALLBACK);
  });

  it('keeps the accents when only the page color can be read', () => {
    // A grayscale picture has a mood but no accents; keeping the previous ones
    // beats returning gray buttons.
    const palette = paletteFromPixels(image([['#9a9a9a', 500]]), FALLBACK);
    expect(palette.button).toBe(FALLBACK.button);
    expect(palette.highlight).toBe(FALLBACK.highlight);
    expect(palette.background).not.toBe(FALLBACK.background);
  });

  /**
   * Not an AA guarantee — that belongs to `theme-custom.ts` and applies to any
   * three colors however they were chosen. This only checks that the page color
   * is pushed far enough from mid-gray to leave the derivation something to
   * work with, which is the whole reason the push exists.
   */
  it('leaves the page color with contrast to spend', () => {
    for (const dominant of ['#123f7a', '#e8b04b', '#7a7a7a', '#2b1a12', '#eeeeee']) {
      const { background } = paletteFromPixels(image([[dominant, 500]]), FALLBACK);
      const best = Math.max(contrast('#000000', background), contrast('#ffffff', background));
      expect(best, `${dominant} -> ${background}`).toBeGreaterThan(7);
    }
  });
});
