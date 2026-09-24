'use client';

import { useState, useTransition } from 'react';
import { PlaceSearchInput, type PlacePoint } from '@/components/events/PlaceSearchInput';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { setZoneLocation } from '@/lib/actions/zones';

/**
 * The organizer's way to pin a zone after creating it, move the pin, or take
 * it off the map. Before this, a zone created without picking a place had no
 * route onto the map at all.
 */
export function ZoneLocationEditor({ zoneId, pinned }: { zoneId: string; pinned: boolean }) {
  const [value, setValue] = useState('');
  const [point, setPoint] = useState<PlacePoint | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function save(next: PlacePoint | null) {
    startTransition(async () => {
      const result = await setZoneLocation(zoneId, next);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update the pin.', result.code);
        return;
      }
      setValue('');
      setPoint(null);
      toast.success(next ? 'Pinned. The zone is on the map.' : 'Pin removed.');
    });
  }

  return (
    <Card className="space-y-2" aria-busy={pending}>
      <label htmlFor="zone-pin" className="block text-sm font-bold text-ink">
        {pinned ? 'Move the pin' : 'Pin this zone to a spot'}
      </label>
      <PlaceSearchInput
        id="zone-pin"
        value={value}
        onChange={setValue}
        onPointChange={setPoint}
        pinned={point !== null}
        pinnedMessage="Ready. Save to put it here."
        placeholder="Venue, campus, city…"
        className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-terracotta"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => point && save(point)}
          disabled={!point || pending}
          className="rounded-pill bg-brand-gradient px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save pin'}
        </button>
        {pinned && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={pending}
            className="rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink-soft disabled:opacity-50"
          >
            Remove from map
          </button>
        )}
      </div>
    </Card>
  );
}
