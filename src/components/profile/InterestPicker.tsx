'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import type { InterestGroup } from '@/lib/interests';

interface InterestPickerProps {
  /** Form field name — one hidden input is emitted per selected value. */
  name: string;
  /** Themed groups of options to choose from. */
  groups: InterestGroup[];
  /** Values selected on mount (e.g. an existing profile). */
  initialSelected?: string[];
  /** Show the search box. Off for short, single-group lists. */
  searchable?: boolean;
  /** Optional cap on how many can be picked. */
  max?: number;
}

/**
 * Browsable, multi-select tag picker used for profile interests and the
 * "down to do" list. Selection lives in local state and is mirrored into
 * hidden inputs so it submits with a plain server-action form — no client
 * fetch needed. Hidden inputs are driven by the full selection (not the
 * currently-visible options), so filtering by search never drops a choice.
 */
export function InterestPicker({
  name,
  groups,
  initialSelected = [],
  searchable = true,
  max,
}: InterestPickerProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [query, setQuery] = useState('');
  const [customDraft, setCustomDraft] = useState('');

  // Toggling a chip changes hidden inputs programmatically, which fires no DOM
  // event — so an enclosing AutosaveForm wouldn't notice. Emit a bubbling
  // `input` after mount so autosave (and anything else listening) picks it up.
  const rootRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    rootRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
  }, [selected]);

  const atLimit = max != null && selected.length >= max;

  function toggle(option: string) {
    setSelected((current) => {
      if (current.includes(option)) {
        return current.filter((value) => value !== option);
      }
      if (max != null && current.length >= max) return current;
      return [...current, option];
    });
  }

  // Anything the taxonomy doesn't list. Selected custom values render as their
  // own chips so they stay visible and removable.
  const presetOptions = useMemo(
    () => new Set(groups.flatMap((group) => group.options)),
    [groups],
  );
  const customSelected = selected.filter((value) => !presetOptions.has(value));

  function addCustom() {
    const value = customDraft.trim();
    if (!value) return;
    setCustomDraft('');
    setSelected((current) => {
      // Case-insensitive de-dupe so "Coffee" and "coffee" don't both land.
      if (current.some((v) => v.toLowerCase() === value.toLowerCase())) {
        return current;
      }
      if (max != null && current.length >= max) return current;
      return [...current, value];
    });
  }

  const q = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          option.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, q]);

  return (
    <div ref={rootRef} className="space-y-4">
      {searchable && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search interests…"
          aria-label="Search interests"
          className="w-full rounded-card border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-terracotta transition-colors"
        />
      )}

      <p className="text-xs text-ink-faint" aria-live="polite">
        {selected.length === 0
          ? 'Nothing selected yet'
          : `${selected.length} selected`}
        {max != null ? ` · up to ${max}` : ''}
      </p>

      <div className="space-y-5">
        {visibleGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              <span aria-hidden className="mr-1">{group.emoji}</span>
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <Chip
                    key={option}
                    selected={isSelected}
                    disabled={!isSelected && atLimit}
                    onClick={() => toggle(option)}
                  >
                    {option}
                  </Chip>
                );
              })}
            </div>
          </div>
        ))}
        {q && visibleGroups.length === 0 && (
          <p className="text-sm text-ink-faint">
            No matches for “{query.trim()}” - add it as your own below.
          </p>
        )}

        {customSelected.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              <span aria-hidden className="mr-1">✨</span>
              Your own
            </p>
            <div className="flex flex-wrap gap-2">
              {customSelected.map((value) => (
                <Chip key={value} selected onClick={() => toggle(value)}>
                  {value}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add your own — the taxonomy is a starting point, not a cage. */}
      <div className="flex gap-2">
        <input
          value={customDraft}
          onChange={(event) => setCustomDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCustom();
            }
          }}
          disabled={atLimit}
          placeholder="Add your own…"
          aria-label="Add your own"
          className="flex-1 min-w-0 rounded-card border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-terracotta transition-colors disabled:opacity-60"
        />
        <Chip
          selected={false}
          emoji="+"
          disabled={atLimit || !customDraft.trim()}
          onClick={addCustom}
        >
          Add
        </Chip>
      </div>

      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </div>
  );
}
