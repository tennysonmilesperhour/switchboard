import { downscaleImage } from '@/lib/client/downscale-image';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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
    throw new Error('That image is too large to upload. Try a smaller photo.');
  }

  const body = (await response.json().catch(() => null)) as {
    url?: string;
    path?: string;
    error?: string;
  } | null;

  // Public buckets return a URL; the private bucket returns a storage path that
  // the render site signs. Either way the caller stores the returned reference.
  const ref = body?.url ?? body?.path;
  if (!response.ok || !ref) {
    throw new Error(body?.error ?? 'Upload failed. Check your connection and try again.');
  }

  return ref;
}
