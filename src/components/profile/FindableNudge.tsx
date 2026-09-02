'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import type { FindabilityState } from '@/lib/findability';

const DISMISS_KEY = 'sb-findable-nudge-dismissed';

/**
 * Sits on /people, above the search that fails because of it.
 *
 * Someone who hasn't verified a contact detail is invisible to every friend
 * looking them up by email or phone — including everyone importing an address
 * book. The cost of that lands on other people, silently, so the only way they
 * learn is if the app tells them.
 *
 * Dismissal is a device preference (the `sb-*` localStorage convention, never
 * authorization). It comes back on a device that hasn't dismissed it, and it
 * disappears everywhere for good the moment a detail is verified — the state is
 * recomputed on the server each visit, so this can't outlive the problem.
 */
export function FindableNudge({ state }: { state: FindabilityState }) {
  // Start hidden and reveal after reading storage: no flash, and no SSR/client
  // hydration mismatch.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 'findable' needs no prompt; 'unavailable' means this deployment can't
  // complete a verification, and asking for one would strand the reader.
  if (dismissed || state.kind === 'findable' || state.kind === 'unavailable') {
    return null;
  }

  const verifying = state.kind === 'verify';
  const detail = verifying ? state.contact : null;

  return (
    <Card tone="gold">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-lg">Friends can’t find you yet</p>
        <button
          type="button"
          aria-label="Dismiss findability tip"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setDismissed(true);
          }}
          className="shrink-0 rounded-full p-1 text-ink-faint hover:text-ink"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {verifying
          ? `Searching by ${detail} only finds people who’ve verified it, and yours isn’t verified — so anyone looking you up that way, or importing their contacts, comes up empty.`
          : 'Searching by email or phone only finds people who’ve verified one. You haven’t added either, so nobody can look you up that way.'}
      </p>
      <Link
        href={verifying ? '/settings' : '/profile/edit'}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
      >
        {verifying ? `Verify your ${detail} →` : 'Add an email or phone →'}
      </Link>
    </Card>
  );
}
