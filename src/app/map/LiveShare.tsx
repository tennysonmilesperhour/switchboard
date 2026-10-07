'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import { errorRef, type ErrorCode } from '@/lib/errors';
import {
  coarsenCoordinate,
  formatDistance,
  isApproximateFix,
  LOCATION_PROMPT_WAIT_MS,
  LOCATION_PROMPT_WAITING,
  type MapMarker,
  type MapPoint,
} from '@/lib/geo';
import { createPositionSender, type Fix, type PositionSender } from '@/lib/client/position-sender';
import { insecurePage, INSECURE_PAGE, locate, LOCATION_DENIED } from '@/lib/client/geolocate';
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

// The reader's last radius, remembered on this device. A preference, so
// browser storage is the right home for it (docs/SECURITY.md §4); every access
// is guarded because storage can be blocked, and the default stands in.
const RADIUS_STORAGE_KEY = 'sb:live-radius';

function readStoredRadius(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(RADIUS_STORAGE_KEY));
    return RADIUS_CHOICES.some((choice) => choice.meters === stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeRadius(meters: number): void {
  try {
    window.localStorage.setItem(RADIUS_STORAGE_KEY, String(meters));
  } catch {
    // Not remembered this time; the choice still applies to this visit.
  }
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 15_000,
};

function geoErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return LOCATION_DENIED;
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Try again in a moment.';
    case error.TIMEOUT:
      return 'Couldn’t get a location fix. Step near a window or outside, and try again.';
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
    label: person.display_name,
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
  /** `failed` when the check did not go through, so nothing may read the
   *  empty list as "nobody is around". */
  onNearbyChange: (markers: MapMarker[], failed?: boolean) => void;
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
  // A failed "who's nearby" check. Shown quietly in place of the count, which
  // would otherwise go on describing a moment that has passed.
  const [nearbyError, setNearbyError] = useState<ErrorCode | null>(null);
  // A render-safe copy of the latest point (the ref below is for stable reads
  // inside interval/watch callbacks; refs must not be read during render).
  const [approxPoint, setApproxPoint] = useState<MapPoint | null>(
    mySharing ? { lat: mySharing.latitude, lng: mySharing.longitude } : null,
  );
  // How precise the device says its latest fix is; see APPROXIMATE_FIX_M.
  const [accuracyM, setAccuracyM] = useState<number | null>(mySharing?.accuracy_m ?? null);

  const watchId = useRef<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPoint = useRef<MapPoint | null>(
    mySharing ? { lat: mySharing.latitude, lng: mySharing.longitude } : null,
  );
  /** Which fixes reach the server, and when: see position-sender.ts. */
  const sender = useRef<PositionSender | null>(null);
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
    sender.current?.stop();
    sender.current = null;
  }, []);

  const pollNearby = useCallback(async () => {
    let result: Awaited<ReturnType<typeof getNearbyPeople>>;
    try {
      result = await getNearbyPeople(radiusRef.current);
    } catch {
      result = { ok: false, code: 'SB-LOCATION-LOAD' };
    }
    if (!result.ok) {
      // A silent failure left the last count and the last pins up as if they
      // were current. Clear them, and say the check didn't go through.
      setNearbyError(result.code ?? 'SB-LOCATION-LOAD');
      setNearbyCount(null);
      onNearbyChange([], true);
      return;
    }
    const people = result.people ?? [];
    setNearbyError(null);
    setNearbyCount(people.length);
    onNearbyChange(peopleToMarkers(people));
  }, [onNearbyChange]);

  /**
   * The share is over: stop the GPS watch and the polling, and show it as off.
   *
   * Sharing turns itself off after its window, and the server stops returning
   * the viewer to anyone, but this screen used to keep saying "You're live on
   * the map" - and keep the GPS watch running - for as long as it stayed open.
   */
  const endShareLocally = useCallback(
    (announce: boolean) => {
      clearTimers();
      setSharing(false);
      setNearbyCount(null);
      setNearbyError(null);
      setExpiresAt(null);
      onSelfChange(null);
      onNearbyChange([]);
      if (announce) toast.info('Your live location turned off on schedule.');
    },
    [clearTimers, onNearbyChange, onSelfChange, toast],
  );
  const startWatch = useCallback(
    (initial: Fix | null) => {
      if (watchId.current !== null || typeof navigator === 'undefined') return;
      sender.current = createPositionSender((fix) => {
        void refreshLocationPoint(fix.point.lat, fix.point.lng, fix.accuracyM).then((result) => {
          // The share ended on the server (it ran out, or was stopped from
          // another tab). Stop following and say so, instead of sending a
          // position every tick that nothing will ever store.
          if (!result.ok && result.error === 'not_sharing') endShareLocally(true);
        });
      });
      if (initial) sender.current.sent(initial);
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const accuracy = pos.coords.accuracy ?? null;
          lastPoint.current = point;
          setApproxPoint(point);
          setAccuracyM(accuracy);
          onSelfChange(point);
          sender.current?.push({ point, accuracyM: accuracy });
        },
        () => {
          // A single failed watch tick isn't worth interrupting the user; the
          // last good point stays on the map until the next success.
        },
        GEO_OPTIONS,
      );
    },
    [onSelfChange, endShareLocally],
  );

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
      const remembered = readStoredRadius();
      if (remembered !== null) {
        radiusRef.current = remembered;
        setRadius(remembered);
      }
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setSupported(false);
        return;
      }
      if (mySharing) {
        onSelfChange({ lat: mySharing.latitude, lng: mySharing.longitude });
        // Not marked as sent: the first fix on this page refreshes the share,
        // which may have gone quiet while the page was closed.
        startWatch(null);
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

  useEffect(() => {
    if (!sharing || !expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    const timeout = window.setTimeout(
      () => endShareLocally(true),
      Math.max(0, Math.min(remaining, 2_147_000_000)),
    );
    return () => window.clearTimeout(timeout);
  }, [sharing, expiresAt, endShareLocally]);

  // Back from a locked screen or another app: say "still here" at once and
  // look again, rather than waiting on the next heartbeat and poll.
  useEffect(() => {
    if (!sharing) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      sender.current?.wake();
      void pollNearby();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sharing, pollNearby]);

  async function start(nextVisibility: LocationVisibility = visibility) {
    if (!supported) return;
    if (insecurePage()) {
      toast.error(INSECURE_PAGE);
      return;
    }
    setBusy(true);
    // An unanswered prompt never calls back, and the Geolocation timeout only
    // starts once permission is given: say so rather than "Turning on…" for
    // ever. A late answer still starts the share.
    const waiting = window.setTimeout(() => {
      setBusy(false);
      toast.error(LOCATION_PROMPT_WAITING);
    }, LOCATION_PROMPT_WAIT_MS);
    try {
      locate(navigator.geolocation, GEO_OPTIONS).then(
        async (pos) => {
          window.clearTimeout(waiting);
          setBusy(true);
          try {
            const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const result = await shareLocation({
              lat: point.lat,
              lng: point.lng,
              accuracyM: pos.coords.accuracy ?? null,
              headline: note,
              visibility: nextVisibility,
              hours: 2,
            });
            if (!result.ok) {
              toast.error(result.error ?? 'Could not start sharing.', result.code);
              return;
            }
            lastPoint.current = point;
            setApproxPoint(point);
            setAccuracyM(pos.coords.accuracy ?? null);
            setSharing(true);
            setVisibility(nextVisibility);
            setExpiresAt(result.expiresAt ?? null);
            onSelfChange(point);
            onShareStart(point);
            startWatch({ point, accuracyM: pos.coords.accuracy ?? null });
            startPoll();
          } catch {
            toast.error('Could not start sharing. Try again.', 'SB-LOCATION-SAVE');
          } finally {
            setBusy(false);
          }
        },
        (error: GeolocationPositionError) => {
          window.clearTimeout(waiting);
          setBusy(false);
          toast.error(geoErrorMessage(error));
        },
      );
    } catch {
      // If the call itself throws, neither callback runs; don't leave the
      // button stuck on "Turning on…".
      window.clearTimeout(waiting);
      setBusy(false);
      toast.error('Could not read your location.');
    }
  }

  // The share only ends on screen once the server has deleted it. Ending it
  // locally first told someone whose Stop had failed that they were off the
  // map while the server went on showing them to everyone nearby.
  async function stop() {
    setBusy(true);
    clearTimers();
    let ended = false;
    try {
      const result = await stopSharingLocation();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not stop sharing.', result.code);
        return;
      }
      ended = true;
      endShareLocally(false);
    } catch {
      toast.error('Could not stop sharing. Try again.', 'SB-LOCATION-SAVE');
    } finally {
      setBusy(false);
      // Still live on the server, so still live here: Stop stays available.
      if (!ended) {
        startWatch(null);
        startPoll();
      }
    }
  }

  // Re-share with a new visibility scope without interrupting the live loop.
  //
  // Shown at once, and put back if the server refuses: a rate-limited request
  // used to leave "Connections only" highlighted while the stored row still
  // showed this person to anyone sharing nearby. Busy for the round trip, so a
  // second tap (or Stop, whose delete this upsert could otherwise undo) waits.
  async function changeVisibility(next: LocationVisibility) {
    const previous = visibility;
    setVisibility(next);
    if (!sharing) return;
    const point = lastPoint.current;
    if (!point) return;
    setBusy(true);
    try {
      const result = await shareLocation({
        lat: point.lat,
        lng: point.lng,
        headline: note,
        visibility: next,
        hours: 2,
      });
      if (!result.ok) {
        setVisibility(previous);
        toast.error(result.error ?? 'Could not change who can see you.', result.code);
        return;
      }
      setExpiresAt(result.expiresAt ?? expiresAt);
      void pollNearby();
    } catch {
      setVisibility(previous);
      toast.error('Could not change who can see you. Try again.', 'SB-LOCATION-SAVE');
    } finally {
      setBusy(false);
    }
  }

  // Widen or narrow who counts as nearby, before or during a share. While
  // sharing, the new circle is checked at once rather than at the next poll.
  function changeRadius(meters: number) {
    setRadius(meters);
    radiusRef.current = meters;
    storeRadius(meters);
    if (sharing) void pollNearby();
  }

  const radiusSelect = (
    <label className="text-xs font-bold text-ink-soft">
      Show people
      <select
        value={radius}
        onChange={(e) => changeRadius(Number(e.target.value))}
        className="ml-1.5 min-h-11 rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-ink outline-none focus:border-terracotta"
      >
        {RADIUS_CHOICES.map((choice) => (
          <option key={choice.meters} value={choice.meters}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );

  if (!supported) {
    return (
      <Card tone="cream">
        <p className="text-sm text-ink-soft leading-relaxed">
          This browser can’t share a live location. Everything else on the map
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
              {nearbyCount !== null && !nearbyError && (
                <>
                  {' '}
                  {nearbyCount === 0
                    ? 'No one else is sharing near you yet.'
                    : `${nearbyCount} ${nearbyCount === 1 ? 'person is' : 'people are'} sharing near you.`}
                </>
              )}
            </p>
            {nearbyError && (
              <p role="status" className="mt-1 text-xs text-ink-faint">
                Couldn’t check who’s nearby just now. It’ll try again shortly.{' '}
                <span className="opacity-70">{errorRef(nearbyError)}</span>
              </p>
            )}
            {isApproximateFix(accuracyM) && (
              <p className="mt-1 text-xs text-ink-faint">
                Your device is giving an approximate location (within{' '}
                {formatDistance(accuracyM as number)}), so your pin and who’s nearby are
                rough. Turn on Precise Location for this browser for a closer match.
              </p>
            )}
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
              disabled={busy}
              aria-pressed={visibility === value}
              className={`rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                visibility === value
                  ? 'border-terracotta bg-terracotta-soft text-terracotta-deep'
                  : 'border-line bg-card text-ink-faint hover:text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
          {radiusSelect}
        </div>
      </Card>
    );
  }

  return (
    <Card tone="cream">
      <p className="font-display text-lg">Share your location live</p>
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
          placeholder="A line others see (optional): “at the market”"
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
          {radiusSelect}
        </div>
      </div>

      <Button size="lg" className="mt-3 w-full" disabled={busy} onClick={() => start()}>
        {busy ? 'Turning on…' : 'Share my location'}
      </Button>
    </Card>
  );
}
