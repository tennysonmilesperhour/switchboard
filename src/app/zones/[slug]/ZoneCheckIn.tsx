'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { checkIn } from '@/lib/actions/moments';
import { EXPERIENCE_PRESETS } from '@/lib/types';
import { useCurrentLocation } from '@/lib/client/use-current-location';

export function ZoneCheckIn({
  zoneId,
  zoneName,
  experiences,
}: {
  zoneId: string;
  zoneName: string;
  experiences: string[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [headline, setHeadline] = useState('');
  const [hours, setHours] = useState(3);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const location = useCurrentLocation();
  const router = useRouter();

  const emojiFor = (label: string) =>
    EXPERIENCE_PRESETS.find((preset) => preset.label === label)?.emoji ?? '✨';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-bold">What would you enjoy sharing here?</p>
        <div className="flex flex-wrap gap-2">
          {experiences.map((experience) => (
            <Chip
              key={experience}
              emoji={emojiFor(experience)}
              selected={selected.includes(experience)}
              onClick={() =>
                setSelected((current) =>
                  current.includes(experience)
                    ? current.filter((e) => e !== experience)
                    : [...current, experience],
                )
              }
            >
              {experience}
            </Chip>
          ))}
        </div>
      </div>
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        maxLength={90}
        placeholder="A line about you (revealed only on mutual curiosity)"
        aria-label="Your headline"
        className="w-full rounded-card border border-line bg-card px-4 py-3 text-sm outline-none focus:border-terracotta"
      />
      <div className="space-y-1.5">
        <label htmlFor="zone-hours" className="text-sm font-bold">
          Here for about {hours} {hours === 1 ? 'hour' : 'hours'}
        </label>
        <input
          id="zone-hours"
          type="range"
          min={1}
          max={12}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="w-full accent-terracotta"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void location.request()}
          disabled={location.status === 'locating'}
          aria-pressed={location.status === 'ready'}
          className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
            location.status === 'ready'
              ? 'border-sage bg-sage-soft text-sage-deep'
              : 'border-line bg-card text-ink-soft hover:border-terracotta hover:text-terracotta-deep'
          }`}
        >
          📍 {location.status === 'locating'
            ? 'Locating…'
            : location.status === 'ready'
              ? 'Pinned to the map'
              : 'Add my location to the map'}
        </button>
        {location.status === 'ready' && (
          <button
            type="button"
            onClick={location.clear}
            className="text-xs font-semibold text-ink-faint hover:text-ink-soft"
          >
            Clear
          </button>
        )}
        {location.error && <span className="text-xs text-ink-faint">{location.error}</span>}
      </div>
      {error && <p role="alert" className="text-sm text-rose-deep">{error}</p>}
      <Button
        size="lg"
        className="w-full"
        disabled={pending || selected.length === 0}
        onClick={() =>
          startTransition(async () => {
            const result = await checkIn(
              zoneName,
              selected,
              headline,
              hours,
              zoneId,
              location.point,
            );
            if (!result.ok) {
              setError(result.error ?? 'Could not check in');
              return;
            }
            router.push('/moments');
          })
        }
      >
        {pending ? 'Checking in…' : 'Check in to the zone ✨'}
      </Button>
    </div>
  );
}
