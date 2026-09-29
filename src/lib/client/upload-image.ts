import { downscaleImage } from '@/lib/client/downscale-image';
import { ERROR_CODES, type ErrorCode } from '@/lib/errors';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * What `uploadImage` and `uploadAudio` throw. `message` is the sentence to show,
 * exactly as before, so callers that render `error.message` keep working;
 * `code` is the registry code the upload route returned for an operational
 * failure (storage not configured, rate limit, storage write failed), so a
 * toast can show it: `toast.error(error.message, error.code)`. Validation
 * refusals ("Please choose an image file.") carry no code.
 */
export class UploadError extends Error {
  readonly code?: ErrorCode;

  constructor(message: string, code?: ErrorCode) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

/** The route's `code`, if it is one the registry knows; never a raw string. */
export function uploadErrorCode(value: unknown): ErrorCode | undefined {
  return typeof value === 'string' && (ERROR_CODES as string[]).includes(value)
    ? (value as ErrorCode)
    : undefined;
}

export async function uploadImage({
  file,
  bucket,
  pathPrefix,
}: {
  file: File;
  bucket: 'media' | 'avatars' | 'covers' | 'media-private';
  pathPrefix: string;
}): Promise<string> {
  // Shrink a full-resolution photo before it goes on the wire. A background
  // photo is otherwise large enough to be rejected at the platform edge — with
  // no JSON error to surface — which is the "Upload failed. Check your
  // connection" a custom background hits while smaller images upload fine.
  const prepared = await downscaleImage(file);

  const formData = new FormData();
  formData.set('file', prepared);
  formData.set('bucket', bucket);
  formData.set('pathPrefix', pathPrefix);

  const response = await fetch('/api/uploads/image', {
    method: 'POST',
    body: formData,
  });

  // A body rejected at the platform edge for its size never reaches the route,
  // so there is no JSON error to read. Say what actually happened rather than
  // blaming the connection.
  if (response.status === 413) {
    throw new UploadError('That image is too large to upload. Try a smaller photo.');
  }

  const body = (await response.json().catch(() => null)) as {
    url?: string;
    path?: string;
    error?: string;
    code?: string;
  } | null;

  // Public buckets return a URL; the private bucket returns a storage path that
  // the render site signs. Either way the caller stores the returned reference.
  const ref = body?.url ?? body?.path;
  if (!response.ok || !ref) {
    throw new UploadError(
      body?.error ?? 'Upload failed. Check your connection and try again.',
      uploadErrorCode(body?.code),
    );
  }

  return ref;
}
