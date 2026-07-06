'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { claimVenue } from '@/lib/actions/venues';

export interface VenueRow {
  id: string;
  name: string;
  area: string | null;
  perk: string;
}

export function VenuePerks({ venues }: { venues: VenueRow[] }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [perk, setPerk] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <section>
      <SectionHeader
        title="Partner perks 🏪"
        hint="Local spots that welcome Switchboard groups"
        action={
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="text-xs font-medium text-terracotta-deep hover:underline underline-offset-4"
          >
            {showForm ? 'Close' : 'Claim a venue'}
          </button>
        }
      />
      {venues.length === 0 && !showForm && (
        <Card tone="cream">
          <p className="text-sm text-ink-soft leading-relaxed">
            No partner venues yet. Run a place people love? Claim it and offer
            a perk. When a group confirms a plan there, they see it.
          </p>
        </Card>
      )}
      {venues.length > 0 && (
        <div className="space-y-2">
          {venues.map((venue) => (
            <Card key={venue.id}>
              <p className="font-bold">
                {venue.name}
                {venue.area && (
                  <span className="text-xs text-ink-faint font-normal"> · {venue.area}</span>
                )}
              </p>
              <p className="text-sm text-ink-soft mt-0.5">🎁 {venue.perk}</p>
            </Card>
          ))}
        </div>
      )}
      {showForm && (
        <Card className="mt-3 animate-rise">
          <div className="space-y-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Venue name (exactly as guests would type it)"
              aria-label="Venue name"
              className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Neighborhood or city"
              aria-label="Venue area"
              className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <input
              value={perk}
              onChange={(e) => setPerk(e.target.value)}
              placeholder="The perk (reserved table, 10% off pitchers…)"
              aria-label="Venue perk"
              className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            {error && <p role="alert" className="text-xs text-rose-deep">{error}</p>}
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await claimVenue(name, area, perk);
                  if (!result.ok) {
                    setError(result.error ?? 'Could not claim');
                    return;
                  }
                  setName('');
                  setArea('');
                  setPerk('');
                  setShowForm(false);
                  router.refresh();
                })
              }
            >
              Claim venue
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
