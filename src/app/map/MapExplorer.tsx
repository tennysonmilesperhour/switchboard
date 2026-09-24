'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/ui/Toast';
import { locateMyPlaces } from '@/lib/actions/map';
import type { MapLayerKey, MapMarker, MapPoint } from '@/lib/geo';
import { buildDirectory, LAYER_META, MAP_LAYERS, markerKey } from '@/lib/map-directory';
import type { LiveLocation } from '@/lib/types';
import type { MapFocus } from './LeafletCanvas';
import { MapDirectory } from './MapDirectory';
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

// `you` is never a toggle (you always see your own pin while sharing); it just
// needs a default so the visibility filter lets it through.
const ALL_ON: Record<MapLayerKey, boolean> = {
  plans: true,
  zones: true,
  places: true,
  live: true,
  you: true,
};

const CONTROL_CLASS =
  'shrink-0 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-60';

/** Layer toggles + the geographic canvas + the directory + live location sharing. */
export function MapExplorer({
  markers,
  mySharing,
  initialFocus,
}: {
  markers: MapMarker[];
  mySharing: LiveLocation | null;
  /** A `<layer>:<id>` key from `/map?focus=…`, so another surface can send the
   *  reader to a specific pin rather than to the map in general. */
  initialFocus?: string | null;
}) {
  const [enabled, setEnabled] = useState<Record<MapLayerKey, boolean>>(ALL_ON);
  const [liveMarkers, setLiveMarkers] = useState<MapMarker[]>([]);
  const [selfPoint, setSelfPoint] = useState<MapPoint | null>(
    mySharing ? { lat: mySharing.latitude, lng: mySharing.longitude } : null,
  );
  // Deliberate camera moves. `focus` flies to one pin, `fitNonce` re-frames
  // everything; both carry a counter so asking twice still moves the map.
  const [focus, setFocus] = useState<MapFocus | null>(() => {
    const hit = initialFocus
      ? markers.find((marker) => markerKey(marker) === initialFocus)
      : undefined;
    return hit ? { markerId: hit.id, lat: hit.lat, lng: hit.lng, nonce: 1 } : null;
  });
  const [fitNonce, setFitNonce] = useState(0);
  const focusSeq = useRef(1);
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

  // Distances are measured from the viewer's own live point, so they only appear
  // while they're sharing — the one moment the app knows where they are.
  const sections = useMemo(() => buildDirectory(visible, selfPoint), [visible, selfPoint]);
  const emptyLayers = useMemo(
    () => MAP_LAYERS.filter((key) => enabled[key] && counts[key] === 0),
    [enabled, counts],
  );

  function toggle(key: MapLayerKey) {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const focusOn = useCallback((id: string, point: MapPoint) => {
    focusSeq.current += 1;
    setFocus({ markerId: id, lat: point.lat, lng: point.lng, nonce: focusSeq.current });
  }, []);

  const showMarker = useCallback(
    (marker: MapMarker) => focusOn(marker.id, { lat: marker.lat, lng: marker.lng }),
    [focusOn],
  );

  const handleNearby = useCallback((next: MapMarker[]) => setLiveMarkers(next), []);
  const handleSelf = useCallback((point: MapPoint | null) => setSelfPoint(point), []);
  // Turning sharing on is a request to be shown where you are; a position tick
  // from the watch that follows is not, so only this moves the map.
  const handleShareStart = useCallback(
    (point: MapPoint) => focusOn('self', point),
    [focusOn],
  );

  function locate() {
    startTransition(async () => {
      const result = await locateMyPlaces();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not look up locations.', result.code);
        return;
      }
      const located = result.located ?? 0;
      const unmatched = result.unmatched ?? 0;
      const remaining = result.remaining ?? 0;
      if (located === 0 && unmatched === 0) {
        toast.success('Everything with an address is already on the map.');
        return;
      }
      const parts: string[] = [];
      if (located > 0) parts.push(`Placed ${located} on the map.`);
      if (unmatched > 0) {
        parts.push(
          `Couldn’t find ${unmatched === 1 ? 'one address' : `${unmatched} addresses`}. A street address or city usually fixes it.`,
        );
      }
      if (remaining > unmatched) parts.push('Press again to keep going.');
      const message = parts.join(' ');
      if (located > 0) toast.success(message);
      else toast.info(message);
    });
  }

  return (
    <div className="space-y-3">
      <p className="-mt-1 text-sm leading-relaxed text-ink-soft">
        Your plans, zones, and shared places on one map — plus who’s sharing their
        location live right now. Tap a layer to show or hide it, and tap anything
        in the list below the map to fly straight to it.
      </p>

      <LiveShare
        mySharing={mySharing}
        onNearbyChange={handleNearby}
        onSelfChange={handleSelf}
        onShareStart={handleShareStart}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Map layers">
        {MAP_LAYERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={enabled[key]}
            className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
              enabled[key]
                ? 'border-terracotta bg-terracotta-soft text-terracotta-deep'
                : 'border-line bg-card text-ink-faint hover:text-ink-soft'
            }`}
          >
            <span aria-hidden>{LAYER_META[key].emoji}</span>
            {LAYER_META[key].label}
            <span className="tabular-nums opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      <LeafletCanvas markers={visible} focus={focus} fitNonce={fitNonce} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFitNonce((n) => n + 1)}
          disabled={visible.length === 0}
          className={CONTROL_CLASS}
        >
          Fit everything showing
        </button>
        {selfPoint && (
          <button
            type="button"
            onClick={() => focusOn('self', selfPoint)}
            className={CONTROL_CLASS}
          >
            Center on me
          </button>
        )}
        <button
          type="button"
          onClick={locate}
          disabled={pending}
          className="shrink-0 rounded-pill bg-brand-gradient px-3 py-1.5 text-xs font-bold text-white shadow-lift transition active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Locating…' : 'Locate my plans'}
        </button>
      </div>

      <MapDirectory
        sections={sections}
        emptyLayers={emptyLayers}
        sharing={Boolean(selfPoint)}
        focusedId={focus?.markerId ?? null}
        onShow={showMarker}
      />

      <p className="text-xs leading-relaxed text-ink-faint">
        “Locate my plans” places your plans and shared places that already have an
        address. Zones are placed from their own settings. Distances
        are measured from your own pin, so they appear once you’re sharing.
      </p>
    </div>
  );
}
