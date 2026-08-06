'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

export const GETTING_STARTED_DISMISS_KEY = 'sb-getting-started-dismissed';

interface GettingStartedProps {
  friendDone: boolean;
  planDone: boolean;
  signalDone: boolean;
}

/**
 * The one first-run guidance card on Home: three live steps computed from real
 * data, so it checks itself off and retires when everything is done. Dismissal
 * is a device preference (the `sb-*` localStorage convention, never
 * authorization); Settings offers a "show tips again" reset.
 */
export function GettingStarted({ friendDone, planDone, signalDone }: GettingStartedProps) {
  // Start hidden; the effect reveals it only after checking storage, which
  // also avoids any SSR/client hydration mismatch.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setDismissed(localStorage.getItem(GETTING_STARTED_DISMISS_KEY) === '1');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || (friendDone && planDone && signalDone)) return null;

  function dismiss() {
    localStorage.setItem(GETTING_STARTED_DISMISS_KEY, '1');
    setDismissed(true);
  }

  const items: Array<{
    done: boolean;
    label: string;
    hint?: string;
    href?: string;
  }> = [
    {
      done: friendDone,
      label: 'Add your first friend',
      hint: 'By handle, email, phone, or contacts',
      href: '/people',
    },
    {
      done: planDone,
      label: 'Float your first plan',
      hint: 'Switchboard sorts out the details',
      href: '/create',
    },
    {
      done: signalDone,
      label: 'Let friends know you’re around',
      hint: 'Tap a signal above — it turns off by itself',
    },
  ];

  return (
    <Card tone="cream">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-lg">Getting started</p>
        <button
          type="button"
          aria-label="Dismiss getting started"
          onClick={dismiss}
          className="shrink-0 rounded-full p-1 text-ink-faint hover:text-ink"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="mt-3 space-y-2.5 text-sm">
        {items.map((item) => {
          const row = (
            <>
              <span aria-hidden className="mt-0.5">{item.done ? '✓' : '○'}</span>
              <span className="min-w-0">
                <span
                  className={
                    item.done ? 'text-ink-faint line-through' : 'font-bold text-ink'
                  }
                >
                  {item.label}
                </span>
                {!item.done && item.hint && (
                  <span className="block text-xs text-ink-faint">{item.hint}</span>
                )}
              </span>
            </>
          );
          return item.href && !item.done ? (
            <Link key={item.label} href={item.href} className="flex items-start gap-2">
              {row}
            </Link>
          ) : (
            <span key={item.label} className="flex items-start gap-2">
              {row}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
