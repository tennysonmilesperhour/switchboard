'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { errorFor, errorRef } from '@/lib/errors';
import { looksOffline } from '@/components/system/offline';

/**
 * Route-level error boundary. Calm, non-alarming copy that owns the problem and
 * offers a way forward, rather than a stack trace.
 *
 * The digest is the point of the reference line below. Next.js already computes
 * it, already writes it into the server-side log for the crash, and until now
 * this page threw it away — so a user reporting "it says something slipped" gave
 * us a sentence that matches every crash in the app and nothing more. Shown
 * beside the code, it turns any screenshot into an exact log lookup.
 *
 * An in-app tap while offline used to land here as "Something slipped" — the
 * service worker only answers full page loads, and this page has no idea why
 * the next one failed. When the failure is the connection it says so, and
 * comes back by itself once the connection does.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    void Promise.resolve().then(update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const offline = looksOffline(error, online);

  // Back online: a missing chunk or page needs a real load, which `reset()`
  // alone cannot fetch.
  useEffect(() => {
    if (!offline) return;
    const reload = () => window.location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [offline]);

  const shown = errorFor(offline ? 'SB-APP-OFFLINE' : 'SB-APP-CRASH');

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="text-4xl" aria-hidden>
        {offline ? '📡' : '🌫️'}
      </span>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        {offline ? 'You’re offline' : 'Something slipped'}
      </h1>
      <p className="max-w-xs text-sm leading-relaxed text-ink-faint">
        {shown.message} {shown.fix}
      </p>
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
        {errorRef(shown.code, error.digest)}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={offline ? () => window.location.reload() : reset}>Try again</Button>
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
