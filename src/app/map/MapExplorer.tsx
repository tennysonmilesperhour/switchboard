'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/ui/Toast';
import { locateMyPlaces } from '@/lib/actions/map';
import type { MapLayerKey, MapMarker, MapPoint } from '@/lib/geo';
import type { LiveLocation } from '@/lib/types';
import { LiveShare } from './LiveShare';

// The Leaflet canvas touches `window`, so it must load client-only. `ssr: false`
// is only allowed on `next/dynamic` inside a Client Component (this one).
const LeafletCanvas = dynamic(
  () => import('./LeafletCanvas').then((mod) => mod.LeafletCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-[60vh] w-full animate-pulse rounded-card border border-line bg-cream" />
    ),
  },
);

const LAYERS: { key: MapLayerKey; label: string; emoji: string }[] = [
  { key: 'live', label: 'Live', emoji: '🟢' },
  { key: 'plans', label: 'Plans', emoji: '📅' },
  { key: 'zones', label: 'Zones', emoji: '✨' },
  { key: 'places', label: 'Shared places', emoji: '📍' },
];

// `you` is never a toggle (you always see your own pin while sharing); it just
// needs a default so the visibility filter lets it through.
const ALL_ON: Record<MapLayerKey, boolean> = {
  plans: true,
  zones: true,
  places: true,
  live: true,
  you: true,
};

/** Layer toggles + the geographic canvas + live location sharing. */
export function MapExplorer({
  markers,
  mySharing,
}: {
  markers: MapMarker[];
  mySharing: LiveLocation | null;
}) {
  const [enabled, setEnabled] = useState<Record<MapLayerKey, boolean>>(ALL_ON);
  const [liveMarkers, setLiveMarkers] = useState<MapMarker[]>([]);
  const [selfPoint, setSelfPoint] = useState<MapPoint | null>(
    mySharing ? { lat: mySharing.latitude, lng: mySharing.longitude } : null,
  );
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const selfMarker = useMemo<MapMarker | null>(
    () =>
      selfPoint
        ? {
            id: 'self',
            layer: 'you',
            label: 'You’re here (sharing live)',
            lat: selfPoint.lat,
            lng: selfPoint.lng,
          }
        : null,
    [selfPoint],
  );

  const allMarkers = useMemo(
    () => [...markers, ...liveMarkers, ...(selfMarker ? [selfMarker] : [])],
    [markers, liveMarkers, selfMarker],
  );

  const counts = useMemo(() => {
    const tally: Record<MapLayerKey, number> = {
      plans: 0,
      zones: 0,
      places: 0,
      live: 0,
      you: 0,
    };
    for (const marker of allMarkers) tally[marker.layer] += 1;
    return tally;
  }, [allMarkers]);

  const visible = useMemo(
    () => allMarkers.filter((marker) => enabled[marker.layer]),
    [allMarkers, enabled],
  );

  function toggle(key: MapLayerKey) {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const handleNearby = useCallback((next: MapMarker[]) => setLiveMarkers(next), []);
  const handleSelf = useCallback((point: MapPoint | null) => setSelfPoint(point), []);

  function locate() {
    startTransition(async () => {
      const result = await locateMyPlaces();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not look up locations.', result.code);
        return;
      }
      if ((result.located ?? 0) === 0) {
        toast.success(
          result.remaining
            ? 'No new spots matched. Add an address to your plans, then try again.'
            : 'Everything with an address is already on the map.',
        );
      } else {
        toast.success(
          `Placed ${result.located} on the map${result.remaining ? ` · ${result.remaining} still to go` : ''}.`,
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="-mt-1 text-sm leading-relaxed text-ink-soft">
        Your plans, zones, and shared places on one map — plus who’s sharing their
        location live right now. Tap a layer to show or hide it.
      </p>

      <LiveShare
        mySharing={mySharing}
        onNearbyChange={handleNearby}
        onSelfChange={handleSelf}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Map layers">
        {LAYERS.map((layer) => (
          <button
            key={layer.key}
            type="button"
            onClick={() => toggle(layer.key)}
            aria-pressed={enabled[layer.key]}
            className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
              enabled[layer.key]
                ? 'border-terracotta bg-terracotta-soft text-terracotta-deep'
                : 'border-line bg-card text-ink-faint hover:text-ink-soft'
            }`}
          >
            <span aria-hidden>{layer.emoji}</span>
            {layer.label}
            <span className="tabular-nums opacity-70">{counts[layer.key]}</span>
          </button>
        ))}
      </div>

      <LeafletCanvas markers={visible} center={selfPoint} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-ink-faint">
          Missing something? “Locate my plans” places the ones that already have
          an address.
        </p>
        <button
          type="button"
          onClick={locate}
          disabled={pending}
          className="shrink-0 rounded-pill bg-brand-gradient px-3 py-1.5 text-xs font-bold text-white shadow-lift transition active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Locating…' : 'Locate my plans'}
        </button>
      </div>
    </div>
  );
}
