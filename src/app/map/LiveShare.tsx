'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import { coarsenCoordinate, type MapMarker, type MapPoint } from '@/lib/geo';
import {
  getNearbyPeople,
  refreshLocationPoint,
  shareLocation,
  stopSharingLocation,
} from '@/lib/actions/live-location';
import type { LiveLocation, LocationVisibility, NearbyPerson } from '@/lib/types';

// How often we re-ask "who's near me" while sharing. Live enough to feel present
// without hammering the rate-limited RPC.
const POLL_MS = 20_000;

const RADIUS_CHOICES: { label: string; meters: number }[] = [
  { label: 'This spot', meters: 1_000 },
  { label: 'Nearby', meters: 5_000 },
  { label: 'Around town', meters: 25_000 },
];

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 15_000,
};

function geoErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. You can enable it in your browser settings.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Try again in a moment.';
    case error.TIMEOUT:
      return 'Timed out getting your location. Try again.';
    default:
      return 'Could not read your location.';
  }
}

/**
 * How far away someone is comes from the directory under the map, measured
 * against the coarsened point we were given. The RPC now derives its own
 * `distance_m` from the same rounded caller and target points, so direct callers
 * cannot refine a hidden fix; recomputing here keeps every map layer on the one
 * client-side distance source used by the directory.
 */
function peopleToMarkers(people: NearbyPerson[]): MapMarker[] {
  return people.map((person) => ({
    id: person.user_id,
    layer: 'live' as const,
    label: person.emoji ? `${person.emoji} ${person.display_name}` : person.display_name,
    sub: [person.headline ?? undefined, person.interests.slice(0, 3).join(' · ') || undefined]
      .filter(Boolean)
      .join(' · '),
    lat: person.latitude,
    lng: person.longitude,
    href: `/u/${person.handle}?from=/map`,
  }));
}

/**
 * The "turn on location" control. Opt-in and time-boxed: the user taps to share,
 * the browser prompts for permission, and only then does a coarse coordinate
 * leave the device. While sharing, we follow their position and poll for other
 * people who are also sharing nearby ("see and be seen"). Everything stops the
 * moment they tap off — and expires on its own regardless.
 */
export function LiveShare({
  mySharing,
  onSelfChange,
  onNearbyChange,
  onShareStart,
}: {
  mySharing: LiveLocation | null;
  /** Where the viewer's own pin is now — including every position tick. */
  onSelfChange: (point: MapPoint | null) => void;
  onNearbyChange: (markers: MapMarker[]) => void;
  /** Fired once, when the viewer turns sharing on here. Separate from
   *  `onSelfChange` so the map can move for the deliberate act and stay put for
   *  the position updates that follow. */
  onShareStart: (point: MapPoint) => void;
}) {
  const toast = useToast();
  const [supported, setSupported] = useState(true);
  const [sharing, setSharing] = useState(Boolean(mySharing));
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<LocationVisibility>(
    mySharing?.visibility === 'connections' ? 'connections' : 'sharers',
  );
  const [radius, setRadius] = useState(RADIUS_CHOICES[1].meters);
  const [note, setNote] = useState(mySharing?.headline ?? '');
  const [expiresAt, setExpiresAt] = useState<string | null>(mySharing?.expires_at ?? null);
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  // A render-safe copy of the latest point (the ref below is for stable reads
  // inside interval/watch callbacks; refs must not be read during render).
  const [approxPoint, setApproxPoint] = useState<MapPoint | null>(
    mySharing ? { lat: mySharing.latitude, lng: mySharing.longitude } : null,
  );

  const watchId = useRef<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPoint = useRef<MapPoint | null>(
    mySharing ? { lat: mySharing.latitude, lng: mySharing.longitude } : null,
  );
  // The radius the active poll loop should use; a ref so changing it doesn't
  // need to tear down and rebuild the interval. Synced in an effect (refs must
  // not be written during render).
  const radiusRef = useRef(radius);
  useEffect(() => {
    radiusRef.current = radius;
  }, [radius]);

  const clearTimers = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollNearby = useCallback(async () => {
    const result = await getNearbyPeople(radiusRef.current);
    if (!result.ok) return;
    const people = result.people ?? [];
    setNearbyCount(people.length);
    onNearbyChange(peopleToMarkers(people));
  }, [onNearbyChange]);

  const startWatch = useCallback(() => {
    if (watchId.current !== null || typeof navigator === 'undefined') return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastPoint.current = point;
        setApproxPoint(point);
        onSelfChange(point);
        void refreshLocationPoint(point.lat, point.lng, pos.coords.accuracy ?? null);
      },
      () => {
        // A single failed watch tick isn't worth interrupting the user; the
        // last good point stays on the map until the next success.
      },
      GEO_OPTIONS,
    );
  }, [onSelfChange]);

  const startPoll = useCallback(() => {
    if (pollTimer.current !== null) return;
    void pollNearby();
    pollTimer.current = setInterval(() => void pollNearby(), POLL_MS);
  }, [pollNearby]);

  // Resume an already-active share (e.g. the user shared, then navigated back).
  // The work is deferred a tick so feature detection and any state it sets don't
  // run synchronously in the effect body (and so `supported` starts true on the
  // server render, avoiding a hydration mismatch) — the pattern used elsewhere.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setSupported(false);
        return;
      }
      if (mySharing) {
        onSelfChange({ lat: mySharing.latitude, lng: mySharing.longitude });
        startWatch();
        startPoll();
      }
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      clearTimers();
    };
    // Run once on mount; the callbacks are stable for the lifetime we care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(nextVisibility: LocationVisibility = visibility) {
    if (!supported) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const result = await shareLocation({
          lat: point.lat,
          lng: point.lng,
          accuracyM: pos.coords.accuracy ?? null,
          headline: note,
          visibility: nextVisibility,
          hours: 2,
        });
        setBusy(false);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not start sharing.', result.code);
          return;
        }
        lastPoint.current = point;
        setApproxPoint(point);
        setSharing(true);
        setVisibility(nextVisibility);
        setExpiresAt(result.expiresAt ?? null);
        onSelfChange(point);
        onShareStart(point);
        startWatch();
        startPoll();
      },
      (error) => {
        setBusy(false);
        toast.error(geoErrorMessage(error));
      },
      GEO_OPTIONS,
    );
  }

  async function stop() {
    setBusy(true);
    clearTimers();
    const result = await stopSharingLocation();
    setBusy(false);
    setSharing(false);
    setNearbyCount(null);
    setExpiresAt(null);
    onSelfChange(null);
    onNearbyChange([]);
    if (!result.ok) toast.error(result.error ?? 'Could not stop sharing.', result.code);
  }

  // Re-share with a new visibility scope without interrupting the live loop.
  async function changeVisibility(next: LocationVisibility) {
    setVisibility(next);
    if (!sharing) return;
    const point = lastPoint.current;
    if (!point) return;
    const result = await shareLocation({
      lat: point.lat,
      lng: point.lng,
      headline: note,
      visibility: next,
      hours: 2,
    });
    if (result.ok) setExpiresAt(result.expiresAt ?? expiresAt);
    void pollNearby();
  }

  if (!supported) {
    return (
      <Card tone="cream">
        <p className="text-sm text-ink-soft leading-relaxed">
          🧭 This browser can’t share a live location. Everything else on the map
          still works.
        </p>
      </Card>
    );
  }

  if (sharing) {
    const approx = approxPoint
      ? `~${coarsenCoordinate(approxPoint.lat).toFixed(3)}, ${coarsenCoordinate(approxPoint.lng).toFixed(3)}`
      : null;
    return (
      <Card tone="gold" className="animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-display text-lg">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-sage-deep" />
              </span>
              You’re live on the map
            </p>
            <p className="mt-1 text-sm text-ink-soft leading-relaxed">
              Visible to{' '}
              <strong>
                {visibility === 'connections' ? 'your connections' : 'people sharing nearby'}
              </strong>
              {expiresAt ? ` · turns off ${formatRelative(expiresAt)}` : ''}.
              {nearbyCount !== null && (
                <>
                  {' '}
                  {nearbyCount === 0
                    ? 'No one else is sharing near you yet.'
                    : `${nearbyCount} ${nearbyCount === 1 ? 'person is' : 'people are'} sharing near you.`}
                </>
              )}
            </p>
            {approx && (
              <p className="mt-1 text-xs text-ink-faint">
                Others see an approximate spot ({approx}), never your exact position.
              </p>
            )}
          </div>
          <Button variant="secondary" size="sm" className="whitespace-nowrap" disabled={busy} onClick={stop}>
            Stop
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Who can see me">
          {(
            [
              ['sharers', 'Anyone sharing'],
              ['connections', 'Connections only'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => changeVisibility(value)}
              aria-pressed={visibility === value}
              className={`rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors ${
                visibility === value
                  ? 'border-terracotta bg-terracotta-soft text-terracotta-deep'
                  : 'border-line bg-card text-ink-faint hover:text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card tone="cream">
      <p className="font-display text-lg">🧭 Share your location live</p>
      <p className="mt-1 text-sm text-ink-soft leading-relaxed">
        Turn location on to appear on the map and see other people who are also
        sharing right now. It’s off by default, only ever an{' '}
        <strong>approximate</strong> spot, and switches itself off after a couple
        of hours.
      </p>

      <div className="mt-3 space-y-2.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={90}
          placeholder="A line others see (optional): “at the market ☕”"
          aria-label="A short note shown to people nearby"
          className="w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-bold text-ink-soft">
            Who can see me
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as LocationVisibility)}
              className="ml-1.5 rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-ink outline-none focus:border-terracotta"
            >
              <option value="sharers">Anyone sharing</option>
              <option value="connections">Connections only</option>
            </select>
          </label>
          <label className="text-xs font-bold text-ink-soft">
            Show people
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="ml-1.5 rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-ink outline-none focus:border-terracotta"
            >
              {RADIUS_CHOICES.map((choice) => (
                <option key={choice.meters} value={choice.meters}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <Button size="lg" className="mt-3 w-full" disabled={busy} onClick={() => start()}>
        {busy ? 'Turning on…' : 'Share my location 🟢'}
      </Button>
    </Card>
  );
}
