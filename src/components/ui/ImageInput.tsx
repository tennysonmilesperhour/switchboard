'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/Icon';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export interface ImageInputProps {
  /** Current image URL (uploaded public URL or a pasted link), or '' for none. */
  value: string;
  onChange: (url: string) => void;
  /** Owner uid — uploads land under `<userId>/…` to satisfy storage RLS. */
  userId: string;
  /** Filename prefix inside the bucket, e.g. `event-cover` or `capsule`. */
  pathPrefix: string;
  /** Storage bucket. Defaults to the shared `media` bucket. */
  bucket?: string;
  /** Preview aspect ratio. */
  aspect?: 'video' | 'square';
  /** Accessible label for the picker (e.g. "cover image"). */
  label?: string;
  className?: string;
}

/**
 * Upload-first image picker. Leads with "Take photo" (opens the camera on a
 * phone) and "Upload" (photo library / file browser); pasting a URL is offered
 * as a de-emphasized fallback rather than the only option. Uploads go straight
 * to Supabase Storage from the client and the resulting public URL is handed
 * back via `onChange`. Reused for plan cover images, capsule photos, and
 * anywhere else the app takes an image.
 */
export function ImageInput({
  value,
  onChange,
  userId,
  pathPrefix,
  bucket = 'media',
  aspect = 'video',
  label = 'image',
  className,
}: ImageInputProps) {
  const supabase = useRef(createClient()).current;
  const uploadInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Image must be under 5MB.');
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const path = `${userId}/${pathPrefix}-${Date.now()}.${ext || 'jpg'}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(`${data.publicUrl}?v=${Date.now()}`);
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  const aspectCls = aspect === 'square' ? 'aspect-square' : 'aspect-video';

  return (
    <div className={className}>
      {value ? (
        <div
          className={`relative w-full ${aspectCls} overflow-hidden rounded-card border border-line bg-cream`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => {
              onChange('');
              setError(null);
            }}
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur transition hover:bg-ink/75"
          >
            <Icon name="trash" size={15} />
          </button>
          <button
            type="button"
            onClick={() => uploadInput.current?.click()}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-pill bg-ink/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur transition hover:bg-ink/75"
          >
            <Icon name="image" size={14} />
            {uploading ? 'Uploading…' : 'Replace'}
          </button>
        </div>
      ) : (
        <div
          className={`flex w-full ${aspectCls} flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-cream/60 px-4 text-center`}
        >
          {uploading ? (
            <p className="text-sm font-semibold text-ink-faint">Uploading…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-brand-gradient px-4 py-2 text-sm font-bold text-white shadow-lift active:scale-[0.97]"
                >
                  <Icon name="camera" size={16} />
                  Take photo
                </button>
                <button
                  type="button"
                  onClick={() => uploadInput.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-4 py-2 text-sm font-bold text-ink transition hover:border-terracotta"
                >
                  <Icon name="upload" size={16} />
                  Upload
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowUrl((v) => !v)}
                className="text-xs font-medium text-ink-faint underline decoration-line underline-offset-2 hover:text-ink"
              >
                or paste an image link
              </button>
            </>
          )}
        </div>
      )}

      {/* Camera capture (phones open the rear camera directly). */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {/* Photo library / file browser. */}
      <input
        ref={uploadInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {showUrl && !value ? (
        <input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          aria-label={`${label} link`}
          className="mt-2 w-full rounded-card border border-line bg-card px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-terracotta"
        />
      ) : null}

      {error ? (
        <p className="mt-2 text-sm font-medium text-rose-deep">{error}</p>
      ) : null}
    </div>
  );
}
