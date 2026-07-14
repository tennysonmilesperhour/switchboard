'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { submitPmf, type PmfChoice } from '@/lib/actions/feedback';

const DONE_KEY = 'sb-pmf';
const CHOICES: { value: PmfChoice; label: string }[] = [
  { value: 'very', label: 'Very disappointed' },
  { value: 'somewhat', label: 'Somewhat disappointed' },
  { value: 'not', label: 'Not disappointed' },
];

/**
 * The Sean Ellis product-market-fit question, asked once, gently, and only when
 * deliberately switched on (NEXT_PUBLIC_PMF_ENABLED=1). Home only, dismissible,
 * and stored so it never asks twice — in keeping with the no-nag brand.
 */
export function PmfSurvey() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PMF_ENABLED !== '1') return;
    if (localStorage.getItem(DONE_KEY)) return;
    // Let the page settle before asking.
    const timer = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!show || pathname !== '/') return null;

  function close() {
    localStorage.setItem(DONE_KEY, '1');
    setShow(false);
  }

  function answer(choice: PmfChoice) {
    startTransition(async () => {
      await submitPmf(choice);
      localStorage.setItem(DONE_KEY, '1');
      setDone(true);
      setTimeout(() => setShow(false), 1600);
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm rounded-card border border-line bg-card p-4 shadow-lift animate-rise">
        {done ? (
          <p className="text-sm font-medium text-ink">Thank you. That helps.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-ink">
                How would you feel if you could no longer use Switchboard?
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Dismiss"
                className="shrink-0 text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta rounded-full"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  disabled={pending}
                  onClick={() => answer(choice.value)}
                  className="rounded-btn border border-line bg-paper px-3.5 py-2 text-left text-sm font-medium text-ink transition-colors hover:border-terracotta hover:text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-60"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
