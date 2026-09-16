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
  /**
   * Whether being findable is settled — a verified detail on file, or a
   * deployment that can't verify one at all (`findabilitySettled`). The second
   * case counts as done deliberately: a step that can never be ticked would
   * keep this card on screen forever.
   */
  findableDone: boolean;
}

/**
 * The one first-run guidance card on Home: four live steps computed from real
 * data, so it checks itself off and retires when everything is done. Dismissal
 * is a device preference (the `sb-*` localStorage convention, never
 * authorization); Settings offers a "show tips again" reset.
 */
export function GettingStarted({
  friendDone,
  planDone,
  signalDone,
  findableDone,
}: GettingStartedProps) {
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

  if (dismissed || (friendDone && planDone && signalDone && findableDone)) return null;

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
      // The composer is always on Home now, so both hints point at it. Without
      // anyone to tell it says so itself rather than being absent, and the
      // first friend is already the step above.
      hint: friendDone
        ? 'Tap a signal above — it turns off by itself'
        : 'The composer is below — it starts working once you’ve added someone',
    },
    {
      done: findableDone,
      label: 'Let friends find you',
      hint: 'Verify an email or phone — searches only match verified ones',
      href: '/settings',
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
          className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-card/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
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
      {/* The three steps are the start; this is the rest of the map, for anyone
          who'd rather see what's here than be shown it a piece at a time. */}
      <Link
        href="/features"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
      >
        See everything Switchboard does →
      </Link>
    </Card>
  );
}
