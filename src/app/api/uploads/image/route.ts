import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set(['media', 'avatars', 'covers']);
const IMAGE_EXTENSIONS = new Set([
  'avif',
  'gif',
  'heic',
  'jpeg',
  'jpg',
  'png',
  'webp',
]);

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

  const formData = await request.formData();
  const file = formData.get('file');
  const bucket = String(formData.get('bucket') ?? 'media');
  const pathPrefix = cleanPathPart(String(formData.get('pathPrefix') ?? ''), 'image');

  if (!(file instanceof File)) return jsonError('Choose an image file.');
  if (!ALLOWED_BUCKETS.has(bucket)) return jsonError('Unsupported image bucket.');
  if (!file.type.startsWith('image/')) return jsonError('Please choose an image file.');
  if (file.size > MAX_UPLOAD_BYTES) return jsonError('Image must be under 5MB.');

  const admin = createAdminClient();
  const ext = extensionFor(file);
  const path = `${user.id}/${pathPrefix}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // Keep uploads resilient if a Supabase project was created before the media
  // migrations ran. Existing buckets return an error here; uploads below still
  // proceed normally.
  await admin.storage.createBucket(bucket, { public: true }).catch(() => null);

  const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
    cacheControl: '3600',
    contentType: file.type || `image/${ext}`,
    upsert: false,
  });

  if (uploadError) {
    console.error('Image upload failed', uploadError);
    return jsonError('Upload failed. Please try again.', 500);
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({
    url: `${data.publicUrl}?v=${Date.now()}`,
    path,
    bucket,
  });
}
