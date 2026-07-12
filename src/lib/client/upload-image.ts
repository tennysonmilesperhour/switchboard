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
  const formData = new FormData();
  formData.set('file', file);
  formData.set('bucket', bucket);
  formData.set('pathPrefix', pathPrefix);

  const response = await fetch('/api/uploads/image', {
    method: 'POST',
    body: formData,
  });
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
