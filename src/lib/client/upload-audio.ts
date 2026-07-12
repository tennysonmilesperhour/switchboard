export interface UploadedVoiceNote {
  /** Storage path in the private bucket; the render site signs it. */
  path: string;
  durationSeconds: number;
}

/**
 * Upload a recorded voice note to the private `media-private` bucket via
 * `/api/uploads/audio`. Returns the storage PATH (voice notes are access-gated,
 * so they are served via short-lived signed URLs, not a public link) plus the
 * duration measured while recording.
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
  const body = (await response.json().catch(() => null)) as {
    path?: string;
    error?: string;
  } | null;

  if (!response.ok || !body?.path) {
    throw new Error(body?.error ?? 'Could not save that voice note. Try again.');
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
