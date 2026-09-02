'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { HostSuggestion } from '@/lib/engine/suggestions';

const OFF_KEY = 'sb-host-suggestions-off';
const MAX_SHOWN = 3;

/**
 * Presentational layer for host coaching suggestions. Gentle, dismissible, and
 * switchable off entirely — the preference lives in localStorage (device-level,
 * non-sensitive) and turning tips off is reversible right here so it never
 * strands the host. Rendering nothing when there's nothing to say keeps the
 * review step calm in the healthy case.
 */
export function HostSuggestions({
  suggestions,
}: {
  suggestions: HostSuggestion[];
}) {
  // null until we've read the stored preference — keeps nothing on screen
  // during SSR and the first client paint, avoiding a hydration mismatch.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Deferred out of the effect body so the read of localStorage doesn't run
    // as a synchronous setState (matches the wizard's contact-support probe).
    const timeout = window.setTimeout(
      () => setEnabled(localStorage.getItem(OFF_KEY) !== '1'),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  function turnOff() {
    localStorage.setItem(OFF_KEY, '1');
    setEnabled(false);
  }

  function turnOn() {
    localStorage.removeItem(OFF_KEY);
    setEnabled(true);
  }

  function dismiss(id: string) {
    setDismissed((current) => new Set(current).add(id));
  }

  if (enabled === null) return null;

  if (!enabled) {
    return (
      <p className="px-1 text-xs text-ink-faint">
        Host tips are off.{' '}
        <button
          type="button"
          onClick={turnOn}
          className="font-semibold text-terracotta-deep underline underline-offset-2 hover:text-terracotta-deep"
        >
          Turn them back on
        </button>
      </p>
    );
  }

  const visible = suggestions
    .filter((s) => !dismissed.has(s.id))
    .slice(0, MAX_SHOWN);
  if (visible.length === 0) return null;

  return (
    <section
      aria-label="Suggestions for your plan"
      className="rounded-card border border-line bg-cream p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
          <Icon name="sparkle" size={16} className="text-terracotta-deep" />
          A couple of thoughts
        </p>
        <button
          type="button"
          onClick={turnOff}
          className="shrink-0 text-xs font-semibold text-ink-faint hover:text-ink"
        >
          Turn off tips
        </button>
      </div>
      <ul className="space-y-2">
        {visible.map((suggestion) => (
          <li
            key={suggestion.id}
            className="flex items-start gap-3 rounded-card bg-card px-3.5 py-3"
          >
            <span aria-hidden className="text-lg leading-none mt-0.5">
              {suggestion.emoji}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-ink">
                {suggestion.title}
              </span>
              <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                {suggestion.body}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Dismiss: ${suggestion.title}`}
              onClick={() => dismiss(suggestion.id)}
              className="shrink-0 rounded-full p-1 text-ink-faint hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-faint">
        Just suggestions - send it however you like.
      </p>
    </section>
  );
}
