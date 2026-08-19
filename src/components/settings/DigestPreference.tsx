'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/Toast';
import { updateDigestPreference } from '@/lib/actions/profile';

interface DigestPreferenceProps {
  enabled: boolean;
  hour: number;
}

/** The hours worth offering. Nobody wants a 3am summary. */
const HOURS = [6, 7, 8, 9, 10, 12, 17, 20];

function label(hour: number): string {
  if (hour === 12) return 'midday';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * One summary a day instead of a day of buzzes.
 *
 * Separate from the notification categories above rather than being another row
 * in them: those decide *what* is worth telling someone, this decides *how* it
 * arrives. Folding a delivery mode into a list of topics reads as "digest" being
 * a kind of event, and then turning it off looks like it should stop something
 * happening.
 *
 * Off unless asked for. The people most likely to want it are the ones with
 * enough going on to find the per-item buzzes noisy, and they will turn it on.
 */
export function DigestPreference({ enabled, hour }: DigestPreferenceProps) {
  const [on, setOn] = useState(enabled);
  const [at, setAt] = useState(hour);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function save(nextOn: boolean, nextHour: number) {
    const wasOn = on;
    const wasAt = at;
    setOn(nextOn);
    setAt(nextHour);
    startTransition(async () => {
      try {
        const result = await updateDigestPreference(nextOn, nextHour);
        if (!result.ok) {
          // Put the control back rather than leave it showing a setting the
          // server does not have — a notification preference that lies about
          // being off is the one people never forgive.
          setOn(wasOn);
          setAt(wasAt);
          toast.error(result.error ?? 'Could not save that.', result.code);
          return;
        }
        router.refresh();
      } catch {
        setOn(wasOn);
        setAt(wasAt);
        toast.error('Could not save that. Try again.');
      }
    });
  }

  return (
    <div className="mt-4 rounded-card border border-line p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(event) => save(event.target.checked, at)}
          className="mt-0.5 size-4 accent-terracotta"
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold">A daily summary instead</span>
          <span className="block text-xs text-ink-soft">
            One quiet round-up of what you missed, rather than a buzz per thing.
            Anything time-sensitive — an invitation, a plan starting soon — still
            reaches you when it happens.
          </span>
        </span>
      </label>

      {on && (
        <label className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
          Send it around
          <select
            value={at}
            disabled={pending}
            onChange={(event) => save(true, Number(event.target.value))}
            className="rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-semibold"
          >
            {HOURS.map((option) => (
              <option key={option} value={option}>
                {label(option)}
              </option>
            ))}
          </select>
          <span className="text-ink-faint">your time</span>
        </label>
      )}
    </div>
  );
}
