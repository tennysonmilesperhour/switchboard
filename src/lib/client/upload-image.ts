export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function uploadImage({
  file,
  bucket,
  pathPrefix,
}: {
  file: File;
  bucket: 'media' | 'avatars' | 'covers';
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
    error?: string;
  } | null;

  if (!response.ok || !body?.url) {
    throw new Error(body?.error ?? 'Upload failed. Check your connection and try again.');
  }

  return body.url;
}
