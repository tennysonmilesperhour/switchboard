'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addCapsuleEntry } from '@/lib/actions/capsules';

export function CapsuleForm({
  eventId,
  initialLine,
  initialPhotoUrl,
}: {
  eventId: string;
  initialLine: string;
  initialPhotoUrl: string;
}) {
  const [line, setLine] = useState(initialLine);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [error, setError] = useState('');
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
        <input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="Photo link (optional)"
          aria-label="Photo link"
          className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
        />
        {error && <p role="alert" className="text-xs text-rose-deep">{error}</p>}
        <Button
          size="sm"
          className="w-full"
          disabled={pending || !line.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await addCapsuleEntry(eventId, line, photoUrl);
              if (!result.ok) setError(result.error ?? 'Could not save');
              else router.refresh();
            })
          }
        >
          {pending ? 'Sealing…' : 'Add to the capsule'}
        </Button>
      </div>
    </Card>
  );
}
