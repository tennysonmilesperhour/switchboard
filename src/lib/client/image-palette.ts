import { paletteFromPixels, type ExtractedPalette } from '@/lib/image-palette';

/** How many pixels a side we sample. Enough to be representative, cheap to read. */
const SAMPLE_SIZE = 56;

/**
 * Decode an image and read three colors out of it.
 *
 * The image is one of our own public storage objects, requested with CORS so
 * the canvas stays untainted and `getImageData` is allowed — a tainted canvas
 * throws a SecurityError instead of returning pixels, which is why this cannot
 * work on an arbitrary pasted URL and why the wallpaper picker does not offer
 * one. Any failure (offline, decode error, a bucket without CORS) resolves to
 * the fallback: matching colors to an image is a convenience, and a convenience
 * that throws is worse than one that shrugs.
 */
export async function paletteFromImage(
  url: string,
  fallback: ExtractedPalette,
): Promise<ExtractedPalette> {
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return paletteFromPixels(data, fallback);
  } catch {
    return fallback;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load that image.'));
    image.src = url;
  });
}
