'use client';

import { useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/ui/Toast';
import { locateMyPlaces } from '@/lib/actions/map';
import type { MapLayerKey, MapMarker } from '@/lib/geo';

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
  { key: 'plans', label: 'Plans', emoji: '📅' },
  { key: 'zones', label: 'Zones', emoji: '✨' },
  { key: 'places', label: 'Shared places', emoji: '📍' },
];

const ALL_ON: Record<MapLayerKey, boolean> = { plans: true, zones: true, places: true };

/** Layer toggles + the geographic canvas + a control to place un-located rows. */
export function MapExplorer({ markers }: { markers: MapMarker[] }) {
  const [enabled, setEnabled] = useState<Record<MapLayerKey, boolean>>(ALL_ON);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const counts = useMemo(() => {
    const tally: Record<MapLayerKey, number> = { plans: 0, zones: 0, places: 0 };
    for (const marker of markers) tally[marker.layer] += 1;
    return tally;
  }, [markers]);

  const visible = useMemo(
    () => markers.filter((marker) => enabled[marker.layer]),
    [markers, enabled],
  );

  function toggle(key: MapLayerKey) {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function locate() {
    startTransition(async () => {
      const result = await locateMyPlaces();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not look up locations.');
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
        Your plans, zones, and shared places on one map. Tap a layer to show or
        hide it.
      </p>

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

      <LeafletCanvas markers={visible} />

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
