'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Route-level error boundary. Calm, non-alarming copy that owns the problem and
 * offers a way forward, rather than a stack trace.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="text-4xl" aria-hidden>
        🌫️
      </span>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        Something slipped
      </h1>
      <p className="max-w-xs text-sm leading-relaxed text-ink-faint">
        A hiccup on our end, not yours. Give it another try in a moment.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/"
          className="rounded-btn px-5 py-2.5 text-[15px] font-bold text-ink-soft hover:text-ink"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
