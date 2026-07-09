'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { runDiscovery } from '@/lib/actions/discovery';
import type { Suggestion } from '@/lib/ai/discovery';

const BUDGETS = ['Free', '$', '$$', '$$$'];
const VIBES = ['Relaxed', 'Adventurous', 'Cozy', 'Lively', 'Quiet'];
const GROUP_SIZES = ['Just us two', 'Small group (3-6)', 'Bigger crew (7+)'];

export function DiscoverClient({ defaultInterests }: { defaultInterests: string[] }) {
  const [location, setLocation] = useState('');
  const [distance, setDistance] = useState(15);
  const [when, setWhen] = useState('');
  const [budget, setBudget] = useState('$$');
  const [vibe, setVibe] = useState('Relaxed');
  const [groupSize, setGroupSize] = useState(GROUP_SIZES[1]);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function search() {
    setError('');
    startTransition(async () => {
      const result = await runDiscovery({
        location,
        distanceMiles: distance,
        when,
        budget,
        groupSize,
        vibe,
        interests: defaultInterests,
      });
      if (!result.ok) setError(result.error ?? 'Something went wrong');
      else setSuggestions(result.suggestions);
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-soft leading-relaxed -mt-1">
        Describe the experience you’re hoping for. Switchboard curates a few
        great fits - not a hundred search results.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="loc" className="text-sm font-medium">Where?</label>
            <input
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
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
          <p className="text-sm font-medium">Vibe</p>
          <div className="flex gap-2 flex-wrap">
            {VIBES.map((v) => (
              <Chip key={v} selected={vibe === v} onClick={() => setVibe(v)}>
                {v}
              </Chip>
            ))}
          </div>
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

        <Button size="lg" className="w-full" disabled={pending} onClick={search}>
          {pending ? 'Curating…' : 'Find something great ✨'}
        </Button>
        {error && <p role="alert" className="text-sm text-rose-deep">{error}</p>}
      </div>

      {suggestions && suggestions.length === 0 && (
        <EmptyState
          emoji="🧭"
          title="Nothing quite fit"
          body="We couldn’t find a great match for those details. Try widening the distance, loosening the budget, or a different vibe."
        />
      )}

      {suggestions && suggestions.length > 0 && (
        <section aria-label="Recommendations" className="space-y-3">
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
    </div>
  );
}
