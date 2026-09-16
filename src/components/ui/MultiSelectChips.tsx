'use client';

import { Chip } from '@/components/ui/Chip';

export interface MultiSelectOption {
  value: string;
  label: string;
  emoji?: string;
}

interface MultiSelectChipsProps {
  options: MultiSelectOption[];
  /** Currently-selected values. */
  selected: string[];
  /** Called with the full next selection whenever a chip is toggled. */
  onChange: (next: string[]) => void;
  /**
   * Optional catch-all chip rendered first (e.g. "Everyone I know", "Any
   * vibe"). By default it reads as selected whenever nothing in THIS group is
   * picked, and tapping it clears this group back to that default.
   *
   * `selected` and `onSelect` are for the case where this group is one of
   * several that make up a single choice. A signal's audience is circles AND
   * named people AND groups: with three people picked and no circle, "nothing
   * in this group" is not "everyone", and letting the chip light up anyway is
   * how a client ended up reporting "it won't let me not select one of the
   * groups" — turning a circle off lit `Everyone I know` instead, which looks
   * like the opposite of what she asked for and left no way to reach "just
   * these three people". Pass both when the catch-all describes the whole
   * choice rather than this group of it.
   */
  allOption?: {
    label: string;
    emoji?: string;
    /** Whether the catch-all is the current state. Defaults to "none picked here". */
    selected?: boolean;
    /** What tapping it does. Defaults to clearing this group. */
    onSelect?: () => void;
  };
  /** Cap on how many specific options can be lit at once. */
  max?: number;
  ariaLabel?: string;
  className?: string;
  /** Extra classes forwarded to every chip (sizing, etc.). */
  chipClassName?: string;
}

/**
 * A chip group where several options can be lit at once — the shared multi-select
 * control for anywhere the app lets you pick from a set (signal audiences,
 * discovery vibes, and so on). It keeps no state of its own: the parent owns the
 * `selected` array and reconciles each `onChange`, so it works with plain state,
 * `useOptimistic`, or a server action. Pass `allOption` for pickers that also
 * need an "everyone / no filter" catch-all.
 */
export function MultiSelectChips({
  options,
  selected,
  onChange,
  allOption,
  max,
  ariaLabel,
  className = 'flex flex-wrap gap-1.5',
  chipClassName,
}: MultiSelectChipsProps) {
  const atLimit = max != null && selected.length >= max;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
      return;
    }
    if (max != null && selected.length >= max) return;
    onChange([...selected, value]);
  }

  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      {allOption ? (
        <Chip
          emoji={allOption.emoji}
          selected={allOption.selected ?? selected.length === 0}
          onClick={allOption.onSelect ?? (() => onChange([]))}
          className={chipClassName}
        >
          {allOption.label}
        </Chip>
      ) : null}
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <Chip
            key={option.value}
            emoji={option.emoji}
            selected={isSelected}
            disabled={!isSelected && atLimit}
            onClick={() => toggle(option.value)}
            className={chipClassName}
          >
            {option.label}
          </Chip>
        );
      })}
    </div>
  );
}
