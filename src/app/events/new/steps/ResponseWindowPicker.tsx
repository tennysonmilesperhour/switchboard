'use client';

import { WINDOW_CHOICES } from '@/lib/engine/windows';
import { splitWindow } from './wizard-types';

interface ResponseWindowPickerProps {
  /** The window everyone shares, or null when the rows disagree ("Mixed"). */
  commonWindow: number | null;
  setWindowForEveryone: (minutes: number) => void;
  suggested: { windowMinutes: number; label: string };
  /** What the control is called: "Everyone gets" for a list, "Time to respond" for one person. */
  label: string;
  /** Shown under the control. Omit for the default explanation. */
  hint?: string;
}

/**
 * One response window for everybody.
 *
 * Asked for as "an option set the time to respond for everyone to be the same
 * window. Like a select all button or something" — with five people that was
 * five identical dropdowns, and the odds of getting all five the same by hand
 * fall with every guest added. It sits above the per-person list on the order
 * step, and stands alone on the invites step when there is no order to set.
 */
export function ResponseWindowPicker({
  commonWindow,
  setWindowForEveryone,
  suggested,
  label,
  hint,
}: ResponseWindowPickerProps) {
  return (
    <div className="rounded-card border-2 border-line bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="window-everyone" className="text-sm font-bold">
          {label}
        </label>
        <select
          id="window-everyone"
          value={commonWindow ?? 'mixed'}
          onChange={(e) => {
            if (e.target.value === 'mixed') return;
            setWindowForEveryone(Number(e.target.value));
          }}
          className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
        >
          {/* Only offered while they really are mixed, and never as a
              destination — picking "Mixed" would have to invent per-person
              values it has no way to know. */}
          {commonWindow === null && (
            <option value="mixed" disabled>
              Mixed
            </option>
          )}
          {/* A window typed into a custom row is still a shared window once
              everyone has it, so it has to be selectable here or the control
              would read "Mixed" for a list that agrees. */}
          {commonWindow !== null &&
            !WINDOW_CHOICES.some((c) => c.windowMinutes === commonWindow) && (
              <option value={commonWindow}>
                {splitWindow(commonWindow).amount} {splitWindow(commonWindow).unit}
              </option>
            )}
          {WINDOW_CHOICES.map((choice) => (
            <option key={choice.windowMinutes} value={choice.windowMinutes}>
              {choice.label} to respond
            </option>
          ))}
        </select>
        {commonWindow !== suggested.windowMinutes && (
          <button
            type="button"
            onClick={() => setWindowForEveryone(suggested.windowMinutes)}
            className="rounded-pill border border-line px-3 py-1.5 text-sm font-semibold text-terracotta-deep transition-colors hover:border-terracotta"
          >
            Use suggested ({suggested.label})
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        {hint ??
          (commonWindow === null
            ? 'Right now people have different windows. Pick one to give everybody the same.'
            : 'Everyone has the same window. You can still change any one person below.')}
      </p>
    </div>
  );
}
