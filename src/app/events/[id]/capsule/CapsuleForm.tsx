'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ImageInput } from '@/components/ui/ImageInput';
import { addCapsuleEntry } from '@/lib/actions/capsules';
import { errorRef, type ErrorCode } from '@/lib/errors';

export function CapsuleForm({
  eventId,
  userId,
  initialLine,
  initialPhotoRef,
  initialPhotoPreview,
}: {
  eventId: string;
  userId: string;
  initialLine: string;
  /** Stored photo reference (private-bucket path) that gets re-submitted. */
  initialPhotoRef: string;
  /** Signed URL for displaying an existing photo. */
  initialPhotoPreview: string;
}) {
  const [line, setLine] = useState(initialLine);
  const [photoRef, setPhotoRef] = useState(initialPhotoRef);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Card>
      <p className="text-sm font-bold">
        {initialLine ? 'Your line (you can update it)' : 'Add your line'}
      </p>
      <div className="space-y-2.5 mt-2.5">
        <textarea
          value={line}
          onChange={(e) => setLine(e.target.value)}
          rows={2}
          maxLength={280}
          placeholder="The moment I want to remember is…"
          aria-label="Your capsule line"
          className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta resize-none"
        />
        <ImageInput
          userId={userId}
          value={photoRef}
          onChange={setPhotoRef}
          previewSrc={initialPhotoPreview}
          bucket="media-private"
          pathPrefix="capsule"
          label="photo"
          aspect="video"
        />
        {error && (
          <p role="alert" className="text-xs text-rose-deep">
            {error}
            {errorCode && (
              <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                {errorRef(errorCode)}
              </span>
            )}
          </p>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={pending || !line.trim()}
          onClick={() =>
            startTransition(async () => {
              setError('');
              setErrorCode(null);
              const result = await addCapsuleEntry(eventId, line, photoRef);
              if (!result.ok) {
                setError(result.error ?? 'Could not save');
                setErrorCode(result.code ?? null);
              } else router.refresh();
            })
          }
        >
          {pending ? 'Sealing…' : 'Add to the capsule'}
        </Button>
      </div>
    </Card>
  );
}
