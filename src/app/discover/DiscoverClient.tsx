'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { MultiSelectChips } from '@/components/ui/MultiSelectChips';
import { EmptyState } from '@/components/ui/EmptyState';
import { Switch } from '@/components/ui/Switch';
import { runDiscovery } from '@/lib/actions/discovery';
import type { Suggestion } from '@/lib/ai/discovery';
import {
  DEFAULT_GROUP_SIZE,
  DISCOVERY_BUDGETS as BUDGETS,
  DISCOVERY_LIMITS,
  DISCOVERY_VIBES as VIBES,
  GROUP_SIZES,
  isSolo,
} from '@/lib/ai/discovery-options';
import { errorFor, errorRef, type ErrorCode } from '@/lib/errors';

export function DiscoverClient({
  defaultInterests,
  focusInterest = null,
}: {
  defaultInterests: string[];
  /**
   * One interest to build ideas around, from `/discover?q=` — the You page
   * links each "still waiting for a first outing" tag here with the promise of
   * "a low-key way in". So it narrows the ask to that interest and starts the
   * vibe at Relaxed; both stay editable.
   */
  focusInterest?: string | null;
}) {
  const [focus, setFocus] = useState<string | null>(focusInterest);
  const [location, setLocation] = useState('');
  const [distance, setDistance] = useState(15);
  const [when, setWhen] = useState('');
  const [budget, setBudget] = useState('$$');
  const [vibes, setVibes] = useState<string[]>(focusInterest ? ['Relaxed'] : []);
  const [groupSize, setGroupSize] = useState<string>(DEFAULT_GROUP_SIZE);
  const [openToMeeting, setOpenToMeeting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  // Set when these are the built-in starters rather than tailored ideas (D25).
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const solo = isSolo(groupSize);

  function search() {
    setError('');
    setErrorCode(null);
    startTransition(async () => {
      try {
        const result = await runDiscovery({
          location,
          distanceMiles: distance,
          when,
          budget,
          groupSize,
          openToMeeting,
          vibes,
          interests: focus ? [focus] : defaultInterests,
        });
        if (!result.ok) {
          setError(result.error ?? errorFor('SB-DISCOVERY-RUN').message);
          setErrorCode(result.code ?? null);
        } else {
          setSuggestions(result.suggestions);
          setNotice(result.notice ?? null);
        }
      } catch {
        setError(errorFor('SB-DISCOVERY-RUN').message);
        setErrorCode('SB-DISCOVERY-RUN');
      }
    });
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Find something to do"
        hint="Describe the vibe - Switchboard curates a few great fits"
      />

      {focus && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-terracotta-soft px-3.5 py-2.5">
          <p className="text-sm text-terracotta-deep">
            Low-key ways into <strong className="font-bold">{focus}</strong>
          </p>
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="text-xs font-semibold text-terracotta-deep underline underline-offset-2"
          >
            Use all my interests
          </button>
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="loc" className="text-sm font-medium">Where?</label>
            <input
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={DISCOVERY_LIMITS.location}
              placeholder="Neighborhood or city"
              className="w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="when" className="text-sm font-medium">When?</label>
            <input
              id="when"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              maxLength={DISCOVERY_LIMITS.when}
              placeholder="Friday evening…"
              className="w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="distance" className="text-sm font-medium">
            Within {distance} miles
          </label>
          <input
            id="distance"
            type="range"
            min={1}
            max={50}
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="range-pink"
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Budget</p>
          <div className="flex gap-2">
            {BUDGETS.map((b) => (
              <Chip key={b} selected={budget === b} onClick={() => setBudget(b)}>
                {b}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            Vibe <span className="font-normal text-ink-faint">· pick any that fit</span>
          </p>
          <MultiSelectChips
            ariaLabel="Vibe"
            className="flex gap-2 flex-wrap"
            options={VIBES.map((v) => ({ value: v, label: v }))}
            selected={vibes}
            onChange={setVibes}
            allOption={{ label: 'Any vibe' }}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Who’s coming?</p>
          <div className="flex gap-2 flex-wrap">
            {GROUP_SIZES.map((g) => (
              <Chip key={g} selected={groupSize === g} onClick={() => setGroupSize(g)}>
                {g}
              </Chip>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-line bg-card px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="open-to-meeting" className="text-sm font-medium">
              Open to meeting people
            </label>
            <Switch
              id="open-to-meeting"
              checked={openToMeeting}
              onCheckedChange={setOpenToMeeting}
            />
          </div>
          <p className="mt-1 text-xs text-ink-faint leading-relaxed">
            {openToMeeting
              ? solo
                ? 'We’ll favour things that are easy to walk into alone - drop-ins, counter seats, classes, community nights.'
                : 'We’ll favour places where a group naturally mixes with other people.'
              : solo
                ? 'Off means we keep to things that are good on your own, no socialising required.'
                : 'Turn on if new faces are welcome, not just the people you’re bringing.'}
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Curating…' : 'Find something great ✨'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-rose-deep">
            {error}
            {errorCode && <span className="ml-2 text-xs opacity-70">{errorRef(errorCode)}</span>}
          </p>
        )}
      </form>

      {suggestions && suggestions.length === 0 && (
        <EmptyState
          emoji="🧭"
          title="Nothing quite fit"
          body="We couldn’t find a great match for those details. Try widening the distance, loosening the budget, or a different vibe."
        />
      )}

      {suggestions && suggestions.length > 0 && (
        <section aria-label="Recommendations" className="space-y-3">
          {notice && (
            <p role="status" className="rounded-card bg-cream px-3.5 py-2.5 text-sm text-ink-soft">
              {notice}
            </p>
          )}
          {suggestions.map((suggestion, i) => (
            <Card key={suggestion.title} lifted className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg">{suggestion.title}</h3>
                <span className="text-xs text-ink-faint whitespace-nowrap rounded-pill bg-cream px-2 py-1">
                  {suggestion.estimatedCost}
                </span>
              </div>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                {suggestion.description}
              </p>
              <p className="text-xs text-terracotta-deep mt-2">
                ✨ {suggestion.why}
              </p>
              {suggestion.category && (
                <span className="mt-2 inline-block rounded-pill bg-cream px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                  {suggestion.category}
                </span>
              )}
              <div className="mt-3">
                <Link
                  href={`/events/new?title=${encodeURIComponent(suggestion.title)}&description=${encodeURIComponent(suggestion.description)}`}
                >
                  <Button size="sm" variant="secondary">Make it a plan →</Button>
                </Link>
              </div>
            </Card>
          ))}
        </section>
      )}
    </section>
  );
}
