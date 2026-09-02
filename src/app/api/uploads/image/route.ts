import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportOperationalError } from '@/lib/server/observability';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// `media-private` is the access-gated bucket (capsule photos); the rest are
// public (avatars, covers, event covers). Private uploads return a path, not a
// public URL — the render site signs it.
const ALLOWED_BUCKETS = new Set(['media', 'avatars', 'covers', 'media-private']);
// Extension -> the Content-Type we will persist. We serve uploads from a PUBLIC
// bucket, so the stored Content-Type must come from this server-controlled map
// and NEVER from the attacker-supplied `file.type`: a file labeled
// `image/svg+xml` would otherwise be served as an executable SVG (stored XSS on
// the storage origin). SVG is intentionally absent — it is rejected outright.
const IMAGE_MIME: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME));

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function cleanPathPart(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  const cleaned = fromName.replace(/[^a-z0-9]/g, '');
  if (IMAGE_EXTENSIONS.has(cleaned)) return cleaned;

  const fromType = file.type.split('/')[1]?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(fromType)) return fromType;
  return 'jpg';
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('Sign in before uploading images.', 401);

  if (!hasAdminCredentials()) {
    return jsonError('Image uploads are not configured on this server yet.', 503);
  }
  if (!(await checkRateLimit(
    `upload:${user.id}`,
    30,
    60 * 60,
    { failClosed: true },
  ))) {
    return jsonError('Upload limit reached. Try again later.', 429);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const bucket = String(formData.get('bucket') ?? 'media');
  const pathPrefix = cleanPathPart(String(formData.get('pathPrefix') ?? ''), 'image');

  if (!(file instanceof File)) return jsonError('Choose an image file.');
  if (!ALLOWED_BUCKETS.has(bucket)) return jsonError('Unsupported image bucket.');
  if (!file.type.startsWith('image/')) return jsonError('Please choose an image file.');
  // SVG can carry script; it is not a safe format to host from a public bucket.
  if (file.type === 'image/svg+xml') return jsonError('SVG images are not supported.');
  if (file.size > MAX_UPLOAD_BYTES) return jsonError('Image must be under 5MB.');

  const admin = createAdminClient();
  const ext = extensionFor(file);
  // Content-Type comes from our extension map, never from the client's file.type.
  const contentType = IMAGE_MIME[ext] ?? 'image/jpeg';
  const isPrivate = bucket === 'media-private';
  const path = `${user.id}/${pathPrefix}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // Keep uploads resilient if a Supabase project was created before the media
  // migrations ran. Existing buckets return an error here; uploads below still
  // proceed normally. The private bucket must never be created as public.
  await admin.storage.createBucket(bucket, { public: !isPrivate }).catch(() => null);

  const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  });

  if (uploadError) {
    await reportOperationalError('image-upload', uploadError, {
      userId: user.id,
      bucket,
      bytes: file.size,
    });
    return jsonError('Upload failed. Please try again.', 500);
  }

  // Private bucket: return the path only (served later via a signed URL).
  if (isPrivate) {
    return NextResponse.json({ path });
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({
    url: `${data.publicUrl}?v=${Date.now()}`,
    path,
    bucket,
  });
}
