'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Dialog';
import { searchPlaces } from '@/lib/actions/map';
import type { PlaceResult } from '@/lib/geo';

export interface PlacePoint {
  lat: number;
  lng: number;
}

interface PlaceSearchInputProps {
  id?: string;
  /** The free-text place name (owned by the parent). */
  value: string;
  onChange: (value: string) => void;
  /** Fires with a coordinate when a place is picked, or null when the text is
   *  edited so a stale pin never rides along with a different place. */
  onPointChange: (point: PlacePoint | null) => void;
  /** Whether the parent currently holds a pinned coordinate for this value. */
  pinned?: boolean;
  placeholder?: string;
  className?: string;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY = 3;

/**
 * A "type a place" combobox for the event wizard's Where? field. As the host
 * types, it asks Nominatim (through the rate-limited `searchPlaces` server
 * action — the browser CSP forbids the cross-origin call directly) for matching
 * places and offers them in a dropdown. Picking one captures its coordinate so
 * the plan is geolocated automatically and shows up on the map. Free text still
 * works: anything the host types is kept as the location name whether or not
 * they pick a suggestion.
 */
export function PlaceSearchInput({
  id,
  value,
  onChange,
  onPointChange,
  pinned = false,
  placeholder,
  className,
}: PlaceSearchInputProps) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Selecting a suggestion writes its label back into `value`; that change must
  // not kick off a fresh search (and reopen the dropdown) for the just-picked place.
  const skipNextSearch = useRef(false);
  // Only the newest keystroke's response may win, so out-of-order resolutions
  // from the server action can't clobber fresher results.
  const requestSeq = useRef(0);
  const listboxId = useId();

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const query = value.trim();
    const seq = ++requestSeq.current;
    // All state updates happen inside this deferred callback, never synchronously
    // in the effect body — that both debounces the typing and satisfies the
    // no-set-state-in-effect rule.
    const handle = setTimeout(async () => {
      if (query.length < MIN_QUERY) {
        setResults([]);
        setOpen(false);
        setLoading(false);
        setSearched(false);
        return;
      }
      setLoading(true);
      const res = await searchPlaces(query);
      if (seq !== requestSeq.current) return; // superseded by a newer keystroke
      setLoading(false);
      setSearched(true);
      setResults(res.ok && res.results ? res.results : []);
      setActiveIndex(-1);
      setOpen(true);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value]);

  function pick(place: PlaceResult) {
    skipNextSearch.current = true;
    onChange(place.label);
    onPointChange({ lat: place.lat, lng: place.lng });
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    setSearched(false);
  }

  function handleChange(next: string) {
    onChange(next);
    // The text no longer describes the pinned place — drop the coordinate so we
    // don't attach the old point to a different location.
    if (pinned) onPointChange(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (event.key === 'Escape') setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      pick(results[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  const showDropdown = open && (loading || results.length > 0 || searched);

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onBlur={() => {
            // Delay so a mousedown on a suggestion resolves before we close.
            window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
          }
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-faint">
          {loading ? (
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-line border-t-terracotta"
            />
          ) : (
            <Icon name="search" size={16} />
          )}
        </span>
      </div>

      {showDropdown && (
        <Popover>
          <ul
            id={listboxId}
            role="listbox"
            className="max-h-64 w-full overflow-auto rounded-card border border-line bg-card py-1 shadow-lift"
          >
          {results.map((place, index) => (
            <li key={`${place.lat},${place.lng},${index}`} role="none">
              <button
                type="button"
                role="option"
                id={`${listboxId}-opt-${index}`}
                aria-selected={index === activeIndex}
                // mousedown (not click) so the pick lands before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(place);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                  index === activeIndex ? 'bg-terracotta-soft' : 'hover:bg-cream'
                }`}
              >
                <Icon name="mapPin" size={16} className="mt-0.5 shrink-0 text-terracotta-deep" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {place.label}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {place.address}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && searched && (
            <li role="none" className="px-3 py-2 text-xs text-ink-faint">
              No matching place — we’ll still save what you typed.
            </li>
          )}
          </ul>
        </Popover>
      )}

      {pinned && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sage-deep">
          <Icon name="mapPin" size={13} />
          Pinned — this plan will show up on the map.
        </p>
      )}
    </div>
  );
}
