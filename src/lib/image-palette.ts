import { hslToHex, luminance, mix, rgbToHsl } from '@/lib/theme-custom';

/**
 * Reading a palette out of a wallpaper.
 *
 * "Pick colors that match the image" is the whole reason a wallpaper and three
 * color pickers are the same feature, and doing it by eye with a native color
 * input is miserable. This does the first pass: dominant color for the page,
 * and the two most present *colorful* colors for the button and the highlight.
 *
 * Pure, over raw RGBA pixels, so it can be tested without a canvas. The browser
 * half — decode, downscale, read pixels — lives in `client/image-palette.ts`.
 *
 * What it deliberately does NOT do is guarantee anything about contrast. That is
 * `theme-custom.ts`'s job and it happens after, on whatever three colors end up
 * chosen, whether they came from here or from a person with a strong opinion.
 * Two mechanisms for one invariant is how the invariant ends up holding in only
 * one of them.
 */

export interface ExtractedPalette {
  background: string;
  button: string;
  highlight: string;
}

/** Colors closer together than this are the same color for our purposes. */
const HUE_SEPARATION = 45;

interface Bucket {
  hex: string;
  count: number;
  hue: number;
  saturation: number;
  lightness: number;
}

/** Group pixels into coarse color bins, biggest first. */
function bucketize(pixels: Uint8ClampedArray): Bucket[] {
  const totals = new Map<number, [number, number, number, number]>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    // Transparent pixels are not part of the picture.
    if (pixels[i + 3] < 128) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const total = totals.get(key) ?? [0, 0, 0, 0];
    total[0] += r;
    total[1] += g;
    total[2] += b;
    total[3] += 1;
    totals.set(key, total);
  }

  return [...totals.values()]
    .map(([r, g, b, count]) => {
      const hex = `#${[r / count, g / count, b / count]
        .map((v) => Math.round(v).toString(16).padStart(2, '0'))
        .join('')}`;
      const [hue, saturation, lightness] = rgbToHsl(hex);
      return { hex, count, hue, saturation, lightness };
    })
    .sort((a, b) => b.count - a.count);
}

/** How much a bucket deserves to be an accent: colorful first, common second. */
function accentScore(bucket: Bucket): number {
  // Near-black and near-white are the picture's paper and shadows, not its
  // colors — a photo is mostly those, and picking by count alone returns gray
  // every time.
  if (bucket.lightness < 0.12 || bucket.lightness > 0.92) return 0;
  if (bucket.saturation < 0.18) return 0;
  return bucket.saturation * Math.sqrt(bucket.count);
}

function circularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * Three colors for an image: a page color that carries its mood, and two
 * accents taken from what is actually vivid in it.
 *
 * The page color is the dominant bin pushed toward whichever extreme it is
 * already nearer. A background lifted straight out of a photograph is a
 * mid-tone, and a mid-tone page is the one case where nothing reaches AA
 * comfortably — the derivation would then spend the whole contrast budget on
 * the text and leave nothing for the image. Pushing it first keeps the hue and
 * buys back the room.
 */
export function paletteFromPixels(
  pixels: Uint8ClampedArray,
  fallback: ExtractedPalette,
): ExtractedPalette {
  const buckets = bucketize(pixels);
  if (buckets.length === 0) return fallback;

  const dominant = buckets[0];
  const towardExtreme = luminance(dominant.hex) < 0.35 ? '#000000' : '#ffffff';
  const background = mix(dominant.hex, towardExtreme, 0.72);

  const scored = buckets
    .map((bucket) => ({ bucket, score: accentScore(bucket) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { ...fallback, background };

  const button = scored[0].bucket;
  // A highlight that is the button again teaches nothing about what is
  // highlighted, so take the best-scoring color a real distance away in hue —
  // and if the image genuinely has only one color, rotate rather than repeat.
  const highlight =
    scored.find(
      ({ bucket }) => circularDistance(bucket.hue, button.hue) >= HUE_SEPARATION,
    )?.bucket ??
    ({
      hex: hslToHex(
        button.hue + 40,
        Math.max(0.5, button.saturation),
        Math.min(0.62, Math.max(0.42, button.lightness)),
      ),
    } as Bucket);

  return { background, button: button.hex, highlight: highlight.hex };
}
