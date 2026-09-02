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
  /**
   * Render each category as a collapsible accordion, collapsed by default with
   * a per-category selected count. Keeps a long taxonomy from dumping every
   * option on screen at once. Off for short, single-group lists.
   */
  collapsible?: boolean;
}

/**
 * Browsable, multi-select tag picker used for profile interests and the
 * "down to do" list. Selection lives in local state and is mirrored into
 * hidden inputs so it submits with a plain server-action form — no client
 * fetch needed. Hidden inputs are driven by the full selection (not the
 * currently-visible options), so filtering by search never drops a choice.
 *
 * With `collapsible`, categories start closed and show only a label + count;
 * the chips render when you open a category (or while a search is active, when
 * every matching category is force-opened so results are never hidden).
 */
export function InterestPicker({
  name,
  groups,
  initialSelected = [],
  searchable = true,
  max,
  collapsible = false,
}: InterestPickerProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [query, setQuery] = useState('');
  const [customDraft, setCustomDraft] = useState('');
  // Which categories are expanded (only meaningful when `collapsible`).
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  // Toggling a chip changes hidden inputs programmatically, which fires no DOM
  // event — so an enclosing settings form wouldn't notice. Emit a bubbling
  // `input` after mount so dirty-tracking (and anything else listening) picks it up.
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

  function toggleGroup(label: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
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
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // A search overrides collapse: every category with a hit is shown open.
  const searching = q.length > 0;

  // Per-group: the options to show (filtered while searching) and how many of
  // the group's full option set is selected (independent of the filter).
  const renderableGroups = useMemo(() => {
    return groups
      .map((group) => {
        const matched = searching
          ? group.options.filter((option) => option.toLowerCase().includes(q))
          : group.options;
        const selectedCount = group.options.reduce(
          (count, option) => count + (selectedSet.has(option) ? 1 : 0),
          0,
        );
        return { group, matched, selectedCount };
      })
      // While searching, drop categories with no matching option.
      .filter(({ matched }) => !searching || matched.length > 0);
  }, [groups, q, searching, selectedSet]);

  const allExpanded =
    !collapsible ||
    searching ||
    groups.every((group) => openGroups.has(group.label));

  function setAllOpen(open: boolean) {
    setOpenGroups(open ? new Set(groups.map((group) => group.label)) : new Set());
  }

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

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint" aria-live="polite">
          {selected.length === 0
            ? 'Nothing selected yet'
            : `${selected.length} selected`}
          {max != null ? ` · up to ${max}` : ''}
        </p>
        {collapsible && !searching && (
          <button
            type="button"
            onClick={() => setAllOpen(!allExpanded)}
            className="text-xs font-semibold text-terracotta-deep hover:text-terracotta-deep"
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      <div className={collapsible && !searching ? 'space-y-2' : 'space-y-5'}>
        {renderableGroups.map(({ group, matched, selectedCount }) => {
          const open = !collapsible || searching || openGroups.has(group.label);

          const header = (
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              <span aria-hidden className="mr-1">
                {group.emoji}
              </span>
              {group.label}
            </p>
          );

          const chips = (
            <div className="flex flex-wrap gap-2">
              {matched.map((option) => {
                const isSelected = selectedSet.has(option);
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
          );

          if (!collapsible || searching) {
            return (
              <div key={group.label} className="space-y-2">
                {header}
                {chips}
              </div>
            );
          }

          // Collapsible, not searching: a tappable header row + count badge.
          return (
            <div
              key={group.label}
              className="rounded-card border border-line bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              >
                <span aria-hidden className="text-base">
                  {group.emoji}
                </span>
                <span className="flex-1 text-sm font-medium text-ink">
                  {group.label}
                </span>
                {selectedCount > 0 && (
                  <span className="rounded-pill bg-terracotta-soft px-2 py-0.5 text-xs font-bold text-terracotta-deep">
                    {selectedCount}
                  </span>
                )}
                <span
                  aria-hidden
                  className={`text-ink-faint transition-transform duration-150 ${
                    open ? 'rotate-90' : ''
                  }`}
                >
                  ›
                </span>
              </button>
              {open && <div className="px-3.5 pb-3.5 pt-0.5">{chips}</div>}
            </div>
          );
        })}

        {searching && renderableGroups.length === 0 && (
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
