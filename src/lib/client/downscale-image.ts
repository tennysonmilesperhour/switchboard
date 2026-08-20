/**
 * Shrink and re-encode a picked image on the client before it is uploaded.
 *
 * A full-resolution photo is the one input that reliably breaks the upload. A
 * phone camera shot is 12+ megapixels and several megabytes, and a background
 * photo is exactly that — the whole point is to fill the screen. The request
 * body is then rejected at the platform edge before the route handler ever
 * runs, so there is no JSON error to read and the caller can only fall back to
 * a generic "check your connection" message (see `upload-image.ts`). That is
 * the failure behind the custom-background upload: small avatars and covers
 * clear the limit, a full photo does not.
 *
 * Drawing the image down to a sane maximum edge and re-encoding it as JPEG
 * takes that photo from megabytes to well under a megabyte with no loss visible
 * on screen, so the body sits comfortably under any edge limit. The upload
 * route's own 5MB cap and server-derived Content-Type remain the real gate;
 * this only keeps well-formed photos from tripping it.
 *
 * It is deliberately best-effort. Anything the browser cannot decode or draw —
 * an animated GIF we would rather not flatten, a HEIC this browser has no
 * decoder for, a canvas the tab is too memory-starved to allocate — falls
 * straight back to the original file, so uploading can never be worse than it
 * was before this step existed.
 */

/** The longest edge we keep. Covers a high-DPI phone background sharply while
 *  turning a 12MP camera photo into a sub-megabyte JPEG. */
export const MAX_IMAGE_EDGE = 2560;

/** Re-encode until the JPEG fits this budget — chosen to sit well under the
 *  platform request-body limits that reject a raw photo. */
const TARGET_MAX_BYTES = 3.5 * 1024 * 1024;

/** Quality steps tried in order; the first that fits the budget wins, otherwise
 *  the smallest we managed. */
const QUALITY_STEPS = [0.85, 0.72, 0.6];

/** A small image that already fits is uploaded untouched: re-encoding it would
 *  spend quality to save nothing. */
const SKIP_UNDER_BYTES = 1024 * 1024;

/**
 * The size to draw a source image at so its longest edge is at most `maxEdge`,
 * preserving aspect ratio and never scaling up. Pure, so the sizing decision is
 * tested without a DOM (the canvas work around it is not, exactly as
 * `image-palette.ts` keeps its pixel math separate from its canvas wrapper).
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest === 0 || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function downscaleImage(file: File): Promise<File> {
  // No DOM (SSR, unit tests) or nothing worth doing for a non-image.
  if (typeof document === 'undefined') return file;
  if (!file.type.startsWith('image/')) return file;
  // Re-encoding an animated GIF to a still JPEG would drop the animation.
  if (file.type === 'image/gif') return file;

  try {
    const image = await loadImage(file);
    const { width, height } = targetDimensions(
      image.naturalWidth,
      image.naturalHeight,
      MAX_IMAGE_EDGE,
    );

    // Already small in both pixels and bytes: hand it back exactly as given.
    if (
      width === image.naturalWidth &&
      height === image.naturalHeight &&
      file.size <= SKIP_UNDER_BYTES
    ) {
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const blob = await encodeUnderBudget(canvas);
    // Never hand back something bigger than we started with — a small, flat PNG
    // can grow as a JPEG, and the original is the better upload in that case.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], withJpgName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode that image.'));
    };
    image.src = url;
  });
}

async function encodeUnderBudget(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const quality of QUALITY_STEPS) {
    const blob = await toBlob(canvas, quality);
    if (!blob) continue;
    if (!smallest || blob.size < smallest.size) smallest = blob;
    if (blob.size <= TARGET_MAX_BYTES) return blob;
  }
  return smallest;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

function withJpgName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'image'}.jpg`;
}
