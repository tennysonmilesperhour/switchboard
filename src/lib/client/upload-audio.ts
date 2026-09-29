import { UploadError, uploadErrorCode } from '@/lib/client/upload-image';

export { UploadError };

export interface UploadedVoiceNote {
  /** Storage path in the private bucket; the render site signs it. */
  path: string;
  durationSeconds: number;
}

/**
 * Upload a recorded voice note to the private `media-private` bucket via
 * `/api/uploads/audio`. Returns the storage PATH (voice notes are access-gated,
 * so they are served via short-lived signed URLs, not a public link) plus the
 * duration measured while recording. Throws an {@link UploadError}, whose
 * `code` carries the route's error code when there is one.
 */
export async function uploadAudio(
  blob: Blob,
  durationSeconds: number,
): Promise<UploadedVoiceNote> {
  const extension = extensionForType(blob.type);
  const file = new File([blob], `voice-note.${extension}`, {
    type: blob.type || 'audio/webm',
  });

  const formData = new FormData();
  formData.set('file', file);

  const response = await fetch('/api/uploads/audio', {
    method: 'POST',
    body: formData,
  });
  // Same edge case as uploadImage: a body refused at the platform edge for its
  // size never reaches the route, so there is no JSON to read, and "try again"
  // would fail the same way.
  if (response.status === 413) {
    throw new UploadError('That voice note is too long to upload. Keep it under a minute.');
  }
  const body = (await response.json().catch(() => null)) as {
    path?: string;
    error?: string;
    code?: string;
  } | null;

  if (!response.ok || !body?.path) {
    throw new UploadError(
      body?.error ?? 'Could not save that voice note. Try again.',
      uploadErrorCode(body?.code),
    );
  }

  return { path: body.path, durationSeconds: Math.max(1, Math.round(durationSeconds)) };
}

function extensionForType(type: string): string {
  const subtype = type.split('/')[1]?.split(';')[0]?.toLowerCase() ?? '';
  if (subtype.includes('webm')) return 'webm';
  if (subtype.includes('ogg')) return 'ogg';
  if (subtype.includes('mp4') || subtype.includes('m4a') || subtype.includes('aac')) return 'm4a';
  if (subtype.includes('mpeg') || subtype.includes('mp3')) return 'mp3';
  if (subtype.includes('wav')) return 'wav';
  return 'webm';
}
