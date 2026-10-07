'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  isApproximateFix,
  LOCATION_PROMPT_WAIT_MS,
  LOCATION_PROMPT_WAITING,
  type MapMarker,
  type MapPoint,
} from '@/lib/geo';
import { insecurePage, INSECURE_PAGE, locate, LOCATION_DENIED } from '@/lib/client/geolocate';
import {
  getExactLocations,
  shareExactLocation,
  stopExactLocation,
  type ExactPoint,
} from '@/lib/actions/exact-location';
import {
  describeGap,
  EXACT_POLL_MS,
  EXACT_SHARE_MINUTES,
  freshness,
  isAppleDevice,
  minutesLeft,
  shouldSendExact,
  walkingDirectionsUrl,
} from '@/lib/exact-location';

const LeafletCanvas = dynamic(
  () => import('@/app/map/LeafletCanvas').then((mod) => mod.LeafletCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 w-full animate-pulse rounded-card border border-line bg-cream" />
    ),
  },
);

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 15_000,
};

function geoErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return LOCATION_DENIED;
    case error.TIMEOUT:
      return 'Couldn’t get a location fix. Step near a window or outside, and try again.';
    default:
      return 'Your location is unavailable right now. Try again in a moment.';
  }
}

/**
 * "Find each other": exact location between two people who matched, shown in
 * their room. Opt-in, one hour at a time, see-and-be-seen (the database only
 * returns the other person's point while yours is live), stopped by Stop,
 * leaving, a block or a sabbatical. src/lib/actions/exact-location.ts.
 */
export function FindEachOther({
  roomId,
  otherName,
}: {
  roomId: string;
  otherName: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<MapPoint | null>(null);
  const [myAccuracy, setMyAccuracy] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [them, setThem] = useState<ExactPoint | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [apple, setApple] = useState(false);

  const watchId = useRef<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSent = useRef<{ point: MapPoint; at: number } | null>(null);
  const sawThem = useRef(false);
  // Read inside the poll without re-creating it on every change.
  const sharingRef = useRef(false);
  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);

  const stopTimers = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const endLocally = useCallback(
    (message?: string) => {
      stopTimers();
      setSharing(false);
      setThem(null);
      setExpiresAt(null);
      lastSent.current = null;
      sawThem.current = false;
      if (message) toast.info(message);
    },
    [stopTimers, toast],
  );

  const poll = useCallback(async () => {
    let result: Awaited<ReturnType<typeof getExactLocations>>;
    try {
      result = await getExactLocations(roomId);
    } catch {
      setLoadError('Couldn’t check where they are. It will try again in a moment.');
      return;
    }
    if (!result.ok) {
      setLoadError(result.error ?? 'Couldn’t check where they are.');
      return;
    }
    setLoadError(null);
    const points = result.points ?? [];
    const mine = points.find((point) => point.isMe) ?? null;
    const theirs = points.find((point) => !point.isMe) ?? null;
    if (!mine) {
      // Stopped elsewhere, ran out, or the room closed to this.
      if (sharingRef.current) endLocally('Your exact location is no longer being shared here.');
      return;
    }
    setExpiresAt(mine.expiresAt);
    setThem(theirs);
    if (theirs && !sawThem.current) {
      sawThem.current = true;
      setFitNonce((n) => n + 1);
    }
  }, [roomId, endLocally]);

  const send = useCallback(
    async (point: MapPoint, accuracy: number | null) => {
      const result = await shareExactLocation(roomId, point.lat, point.lng, accuracy, false);
      if (result.ok && result.status === 'not_sharing') {
        endLocally('Your hour of exact location ended.');
      }
    },
    [roomId, endLocally],
  );

  const startFollowing = useCallback(() => {
    if (watchId.current === null) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const accuracy = pos.coords.accuracy ?? null;
          setMe(point);
          setMyAccuracy(accuracy);
          const at = Date.now();
          if (shouldSendExact(lastSent.current, point, at)) {
            lastSent.current = { point, at };
            void send(point, accuracy);
          }
        },
        () => {
          // One failed tick isn't worth interrupting anyone; the last good
          // point stays until the next success.
        },
        GEO_OPTIONS,
      );
    }
    if (pollTimer.current === null) {
      void poll();
      pollTimer.current = setInterval(() => void poll(), EXACT_POLL_MS);
    }
  }, [poll, send]);

  // Pick up a share already running in this room (a reload, or a second visit).
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setApple(isAppleDevice(navigator.userAgent));
      void (async () => {
        const result = await getExactLocations(roomId).catch(() => null);
        const mine = result?.ok ? result.points?.find((point) => point.isMe) : undefined;
        if (mine && 'geolocation' in navigator) {
          setOpen(true);
          setSharing(true);
          setExpiresAt(mine.expiresAt);
          setMe({ lat: mine.latitude, lng: mine.longitude });
          startFollowing();
        }
      })();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      stopTimers();
    };
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ticking clock for "updated 8 s ago" and the minutes left.
  useEffect(() => {
    if (!sharing) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [sharing]);

  // Back from a locked screen: say "still here" and look again at once.
  useEffect(() => {
    if (!sharing) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      lastSent.current = null;
      void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sharing, poll]);

  // The hour is up: stop following here too, whether or not a poll noticed.
  useEffect(() => {
    if (!sharing || !expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    const timeout = window.setTimeout(
      () => endLocally('Your hour of exact location ended.'),
      Math.max(0, Math.min(remaining, 2_147_000_000)),
    );
    return () => window.clearTimeout(timeout);
  }, [sharing, expiresAt, endLocally]);

  async function start() {
    if (!('geolocation' in navigator)) {
      toast.error('This browser can’t share a location.');
      return;
    }
    if (insecurePage()) {
      toast.error(INSECURE_PAGE);
      return;
    }
    setBusy(true);
    const waiting = window.setTimeout(() => {
      setBusy(false);
      toast.error(LOCATION_PROMPT_WAITING);
    }, LOCATION_PROMPT_WAIT_MS);
    try {
      const pos = await locate(navigator.geolocation, GEO_OPTIONS);
      window.clearTimeout(waiting);
      const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const accuracy = pos.coords.accuracy ?? null;
      const result = await shareExactLocation(roomId, point.lat, point.lng, accuracy, true);
      if (!result.ok) {
        toast.error(result.error ?? 'Couldn’t share your location.', result.code);
        return;
      }
      lastSent.current = { point, at: Date.now() };
      setMe(point);
      setMyAccuracy(accuracy);
      setSharing(true);
      startFollowing();
    } catch (error) {
      window.clearTimeout(waiting);
      const message =
        error && typeof error === 'object' && 'code' in error
          ? geoErrorMessage(error as GeolocationPositionError)
          : 'Couldn’t share your location.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    const result = await stopExactLocation(roomId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? 'Couldn’t stop sharing.', result.code);
      return;
    }
    endLocally();
    toast.success('Stopped sharing your exact location.');
  }

  const theirPoint = them ? { lat: them.latitude, lng: them.longitude } : null;
  const markers: MapMarker[] = [];
  if (me) markers.push({ id: 'me', layer: 'you', label: 'You', lat: me.lat, lng: me.lng });
  if (theirPoint) {
    markers.push({ id: 'them', layer: 'live', label: otherName, lat: theirPoint.lat, lng: theirPoint.lng });
  }

  return (
    <section
      aria-label="Find each other"
      className="mb-2 rounded-card border border-line bg-card px-3 py-2.5"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta rounded"
      >
        <span className="text-sm font-semibold text-ink">
          📍 Find each other
          {sharing && <span className="ml-2 text-xs font-medium text-sage-deep">Sharing</span>}
        </span>
        <span className="text-xs text-ink-soft">{open ? 'Hide' : 'Open'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2.5">
          {!sharing ? (
            <>
              <p className="text-sm text-ink-soft leading-relaxed">
                Meeting up? Share your exact location with {otherName} for the next{' '}
                {EXACT_SHARE_MINUTES} minutes. You’ll see theirs once they share too. Stop any
                time.
              </p>
              <Button onClick={start} disabled={busy}>
                {busy ? 'Getting your location…' : 'Share my exact location'}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink" role="status">
                {theirPoint && me
                  ? describeGap(me, theirPoint, otherName)
                  : `You’re sharing. Waiting for ${otherName} to share theirs.`}
              </p>
              {them && (
                <p className="text-xs text-ink-soft">
                  Updated {freshness(them.updatedAt, now)}
                  {isApproximateFix(them.accuracyM) ? ' · their phone is giving a rough location' : ''}
                </p>
              )}
              {isApproximateFix(myAccuracy) && (
                <p className="text-xs text-ink-soft">
                  Your phone is giving a rough location. On iPhone, turn on Precise Location for
                  Safari in Settings › Privacy &amp; Security › Location Services.
                </p>
              )}
              {loadError && <p className="text-xs text-ink-soft">{loadError}</p>}
              {markers.length > 0 && (
                <LeafletCanvas
                  markers={markers}
                  fitNonce={fitNonce}
                  heightClass="h-56"
                  maxFitZoom={18}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                {theirPoint && (
                  <a
                    href={walkingDirectionsUrl(theirPoint, apple)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center rounded-pill bg-ink px-4 text-sm font-semibold text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  >
                    Walk to {otherName}
                  </a>
                )}
                <Button variant="secondary" onClick={stop} disabled={busy}>
                  Stop sharing
                </Button>
                {expiresAt && (
                  <span className="text-xs text-ink-soft">
                    {minutesLeft(expiresAt, now)} min left
                  </span>
                )}
              </div>
              {loadError === null && !them && (
                <p className="text-xs text-ink-soft">
                  Keep this chat open so {otherName} can keep seeing you.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
