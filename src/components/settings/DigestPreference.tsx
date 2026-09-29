'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useSettingsSave } from '@/app/settings/SettingsSaveBar';
import { updateDigestPreference } from '@/lib/actions/profile';

interface DigestPreferenceProps {
  enabled: boolean;
  hour: number;
  /** Push is configured on this deployment (it may still be off on every device). */
  pushAvailable: boolean;
  /** A verified email and a mail provider: where the summary goes when push can't. */
  emailFallback: boolean;
}

/** The hours worth offering. Nobody wants a 3am summary. */
const HOURS = [6, 7, 8, 9, 10, 12, 17, 20];

function label(hour: number): string {
  if (hour === 12) return 'midday';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

interface Draft {
  on: boolean;
  at: number;
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
 *
 * Held for the Settings save bar like every other choice on the page; it used
 * to save the moment it was touched, which made it the one notification choice
 * that Cancel could not undo.
 */
export function DigestPreference({
  enabled,
  hour,
  pushAvailable,
  emailFallback,
}: DigestPreferenceProps) {
  const { register, setDirty } = useSettingsSave();
  const id = useId();
  const [draft, setDraft] = useState<Draft>({ on: enabled, at: hour });
  const [baseline, setBaseline] = useState<Draft>({ on: enabled, at: hour });
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);

  useEffect(() => {
    return register(id, {
      save: async () => {
        const next = draftRef.current;
        const result = await updateDigestPreference(next.on, next.at);
        if (result.ok) {
          setBaseline(next);
          setDirty(id, false);
        }
        return result;
      },
      cancel: () => {
        setDraft(baselineRef.current);
        setDirty(id, false);
      },
    });
  }, [id, register, setDirty]);

  const update = useCallback(
    (next: Draft) => {
      setDraft(next);
      const base = baselineRef.current;
      // The hour only matters while it is on.
      setDirty(id, next.on !== base.on || (next.on && next.at !== base.at));
    },
    [id, setDirty],
  );

  const nowhereToGo = draft.on && !pushAvailable && !emailFallback;

  return (
    <div className="mt-4 rounded-card border border-line p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={draft.on}
          onChange={(event) => update({ ...draft, on: event.target.checked })}
          className="mt-0.5 size-4 accent-terracotta"
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold">A daily summary instead</span>
          <span className="block text-xs text-ink-soft">
            One round-up of what you missed, instead of a buzz per thing. Invitations and
            changes to plans you’re in — a new time, a new place, a cancellation — plus
            reminders still reach you the moment they happen. Everything else waits for the
            summary.
          </span>
        </span>
      </label>

      {draft.on && (
        <>
          <label className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
            Send it around
            <select
              value={draft.at}
              onChange={(event) => update({ ...draft, at: Number(event.target.value) })}
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
          <p className="mt-2 text-xs text-ink-faint leading-relaxed">
            It arrives at that hour even inside your quiet hours — you asked for it then. It
            comes as a push; if none of your devices has push turned on, it comes to your
            verified email instead.
          </p>
          {nowhereToGo && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-deep">
              There’s nowhere to send it yet: push isn’t available here and you have no verified
              email. Verify an email above, or your summary will only be in the inbox.
            </p>
          )}
        </>
      )}
    </div>
  );
}
