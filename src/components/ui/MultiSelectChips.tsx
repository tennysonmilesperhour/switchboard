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
   * vibe"). It reads as selected whenever nothing specific is picked, and
   * tapping it clears the selection back to that default.
   */
  allOption?: { label: string; emoji?: string };
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
          selected={selected.length === 0}
          onClick={() => onChange([])}
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
