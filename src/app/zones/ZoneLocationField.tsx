'use client';

import { useState } from 'react';
import { PlaceSearchInput, type PlacePoint } from '@/components/events/PlaceSearchInput';

/**
 * The zone-creation "Where is it?" field. A place picker whose chosen coordinate
 * is mirrored into hidden latitude/longitude inputs so it submits with the plain
 * server-action form and anchors the zone on the map from creation. Free text is
 * fine too — an unpicked location just leaves the coordinate blank.
 */
export function ZoneLocationField({ className }: { className?: string }) {
  const [value, setValue] = useState('');
  const [point, setPoint] = useState<PlacePoint | null>(null);

  return (
    <div className="space-y-1.5">
      <label htmlFor="zone-location" className="text-xs text-ink-faint">
        Where is it? <span className="text-ink-faint">(optional — puts it on the map)</span>
      </label>
      <PlaceSearchInput
        id="zone-location"
        value={value}
        onChange={setValue}
        onPointChange={setPoint}
        pinned={point !== null}
        placeholder="Venue, campus, city…"
        className={className}
      />
      <input type="hidden" name="latitude" value={point?.lat ?? ''} />
      <input type="hidden" name="longitude" value={point?.lng ?? ''} />
    </div>
  );
}
