'use client';

import { useId, useMemo } from 'react';
import {
  HOUR_CHOICES,
  MERIDIEMS,
  formatClock,
  joinClock,
  minuteChoices,
  splitClock,
  type ClockParts,
} from '@/lib/time-options';

interface TimeSelectProps {
  id?: string;
  /** `HH:MM` (24h) — the same value shape `<input type="time">` produces. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Label for the "nothing chosen" row. Omit it when the field always has a
   * time, so the control can't be emptied by accident.
   */
  emptyLabel?: string;
  /** Layout classes for the control as a whole. It brings its own field look. */
  className?: string;
  'aria-label'?: string;
}

/**
 * Where an empty field lands when its first column is touched. Evening on the
 * hour, matching the wizard's own default start: an end time is nearly always
 * the same evening as the start it follows.
 */
const FALLBACK: ClockParts = { hour12: 7, minute: 0, meridiem: 'PM' };

/**
 * Pick a wall-clock time the way people say one: an hour, a minute, AM or PM.
 *
 * Not `<input type="time">`, because iOS ignores `step` on it and offers a
 * minute-by-minute wheel — hosts aiming for 5:20 kept landing on 5:19. And no
 * longer one `<select>` of every five-minute slot either: that had the right
 * detents but 288 of them, so reaching 7:30pm meant scrolling past ninety rows
 * of times nobody wanted.
 *
 * Three short controls instead. Twelve hours, twelve minutes, and a two-button
 * toggle for the half of the day, so nothing scrolls more than one screen and
 * the common case — an evening on the hour or the half hour — is three taps.
 * Each column is a native `<select>`, which is still a wheel on a phone and a
 * dropdown on a laptop; only the number of detents changed.
 *
 * See `src/lib/time-options.ts` for the grid and the `HH:MM` conversions.
 */
export function TimeSelect({
  id,
  value,
  onChange,
  emptyLabel,
  className = '',
  'aria-label': ariaLabel,
}: TimeSelectProps) {
  const generatedId = useId();
  const hourId = id ?? `${generatedId}-hour`;

  const parts = splitClock(value);

  // The minute column carries an off-grid minute in place: a plan imported from
  // a link or dictated aloud can start at 6:47, and dropping the 47 would show
  // a time the plan does not have.
  const minutes = useMemo(() => minuteChoices(parts?.minute ?? null), [parts?.minute]);

  const emit = (next: Partial<ClockParts>) =>
    onChange(joinClock({ ...(parts ?? FALLBACK), ...next }));

  const summary = parts ? formatClock(value) : (emptyLabel ?? 'No time chosen');

  return (
    <div
      role="group"
      aria-label={ariaLabel ? `${ariaLabel}, ${summary}` : summary}
      className={`flex items-center rounded-card border border-line bg-card pr-1.5 transition-colors focus-within:border-terracotta focus-within:ring-2 focus-within:ring-terracotta-soft ${className}`}
    >
      <Column
        id={hourId}
        aria-label="Hour"
        value={parts ? String(parts.hour12) : ''}
        onChange={(next) => (next === '' ? onChange('') : emit({ hour12: Number(next) }))}
        className="pl-3.5"
      >
        {/* Offered when the caller allows an empty field, labelled in their own
            words ("No end time") so the closed control says what the blank
            means. Also rendered — but not selectable — when a field that is
            supposed to always hold a time somehow doesn't: a select whose value
            matches no option displays the first one, so without this the
            control would quietly claim a time the plan does not have. */}
        {(emptyLabel !== undefined || !parts) && (
          <option value="" disabled={emptyLabel === undefined}>
            {emptyLabel ?? '--'}
          </option>
        )}
        {HOUR_CHOICES.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </Column>

      {/* Minutes and the half of the day have nothing to say until there is an
          hour to qualify, so an empty field is just its own label. */}
      {parts && (
        <>
          <span aria-hidden className="font-semibold text-ink-faint">
            :
          </span>

          <Column
            aria-label="Minutes"
            value={String(parts.minute)}
            onChange={(next) => emit({ minute: Number(next) })}
            className="pl-1"
          >
            {minutes.map((minute) => (
              <option key={minute} value={minute}>
                {String(minute).padStart(2, '0')}
              </option>
            ))}
          </Column>

          <div
            role="group"
            aria-label="Morning or afternoon"
            className="ml-auto flex shrink-0 gap-0.5 rounded-pill bg-cream p-0.5"
          >
            {MERIDIEMS.map((meridiem) => {
              const selected = parts.meridiem === meridiem;
              return (
                <button
                  key={meridiem}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => emit({ meridiem })}
                  className={`rounded-pill px-2.5 py-2 text-xs font-bold tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-terracotta ${
                    selected
                      ? 'bg-terracotta text-white shadow-lift'
                      : 'text-ink-soft hover:text-terracotta'
                  }`}
                >
                  {meridiem}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One column of the picker: a native select stripped of its own chrome so the
 * three of them read as a single field, with the chevron drawn back on.
 */
function Column({
  id,
  value,
  onChange,
  className = '',
  children,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
  'aria-label': string;
}) {
  return (
    <div className="relative min-w-0">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none truncate bg-transparent py-3 pr-4 text-[15px] font-semibold text-ink outline-none ${className}`}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-0 top-1/2 size-3.5 -translate-y-1/2 fill-current text-ink-faint"
      >
        <path d="M12 15.06 6.7 9.76l1.42-1.41L12 12.23l3.88-3.88 1.42 1.41z" />
      </svg>
    </div>
  );
}
