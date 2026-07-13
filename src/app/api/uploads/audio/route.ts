import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportOperationalError } from '@/lib/server/observability';

// Voice notes are short; keep them small so playback is snappy and storage
// stays cheap. ~1 min of Opus/webm is well under this.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Voice notes are access-gated (event thread / cancellation), so they live in
// the PRIVATE bucket and are served only via short-lived signed URLs. The route
// returns the storage path; the render site signs it (src/lib/server/media.ts).
const BUCKET = 'media-private';

// MediaRecorder output varies by browser: webm/opus (Chrome/Firefox),
// mp4/aac (Safari), ogg. Accept the common containers.
const AUDIO_EXTENSIONS: Record<string, string> = {
  webm: 'webm',
  ogg: 'ogg',
  oga: 'ogg',
  mp3: 'mp3',
  mpeg: 'mp3',
  m4a: 'm4a',
  mp4: 'm4a',
  aac: 'aac',
  wav: 'wav',
  x_m4a: 'm4a',
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  if (AUDIO_EXTENSIONS[fromName]) return AUDIO_EXTENSIONS[fromName];

  // e.g. "audio/webm;codecs=opus" -> "webm"
  const subtype = file.type.split('/')[1]?.split(';')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  if (AUDIO_EXTENSIONS[subtype]) return AUDIO_EXTENSIONS[subtype];
  return 'webm';
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('Sign in before uploading a voice note.', 401);

  if (!hasAdminCredentials()) {
    return jsonError('Voice notes are not configured on this server yet.', 503);
  }
  if (!(await checkRateLimit(`upload:${user.id}`, 30, 60 * 60))) {
    return jsonError('Upload limit reached. Try again later.', 429);
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) return jsonError('Record a voice note first.');
  if (!file.type.startsWith('audio/')) return jsonError('That does not look like an audio clip.');
  if (file.size === 0) return jsonError('The recording was empty. Try again.');
  if (file.size > MAX_UPLOAD_BYTES) return jsonError('Voice note is too long. Keep it under a minute.');

  const admin = createAdminClient();
  const ext = extensionFor(file);
  const path = `${user.id}/voice-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // Resilient if a Supabase project predates the private-media migration.
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => null);

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    contentType: file.type || `audio/${ext}`,
    upsert: false,
  });

  if (uploadError) {
    await reportOperationalError('audio-upload', uploadError, {
      userId: user.id,
      bucket: BUCKET,
      bytes: file.size,
    });
    return jsonError('Upload failed. Please try again.', 500);
  }

  // Private bucket: return the storage path (not a public URL). The render site
  // mints a short-lived signed URL for authorized viewers.
  return NextResponse.json({ path });
}
