'use client';

import { useMemo } from 'react';
import { timeOptions } from '@/lib/time-options';

interface TimeSelectProps {
  id?: string;
  /** `HH:MM` (24h) — the same value shape `<input type="time">` produces. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Label for the "nothing chosen" row. Omit it when the field always has a
   * time, so the list can't be emptied by accident.
   */
  emptyLabel?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Pick a wall-clock time in five-minute steps.
 *
 * A `<select>` rather than `<input type="time">` because on iOS the time input
 * is a minute-by-minute wheel that ignores `step` — hosts kept landing on 5:19
 * when they meant 5:20. A select is still a native wheel on a phone and a
 * native dropdown on a laptop; only its detents changed. See
 * `src/lib/time-options.ts` for the grid itself.
 */
export function TimeSelect({
  id,
  value,
  onChange,
  emptyLabel,
  className = '',
  'aria-label': ariaLabel,
}: TimeSelectProps) {
  // `value` is in the deps because an off-grid time (a plan imported from a
  // link) is carried into the list rather than dropped.
  const options = useMemo(() => timeOptions(value), [value]);

  return (
    <div className="relative">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none pr-10 ${className}`}
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 fill-current text-ink-faint"
      >
        <path d="M12 15.06 6.7 9.76l1.42-1.41L12 12.23l3.88-3.88 1.42 1.41z" />
      </svg>
    </div>
  );
}
