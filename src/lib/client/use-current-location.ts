'use client';

import { useCallback, useState } from 'react';
import {
  formatDistance,
  isApproximateFix,
  LOCATION_PROMPT_WAIT_MS,
  LOCATION_PROMPT_WAITING,
  type MapPoint,
} from '@/lib/geo';
import { insecurePage, INSECURE_PAGE, locate, LOCATION_DENIED } from '@/lib/client/geolocate';

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'approximate' | 'error' | 'unsupported';

interface CurrentLocation {
  status: LocationStatus;
  point: MapPoint | null;
  accuracyM: number | null;
  error: string | null;
  /** Ask the browser for a one-shot fix; resolves to the point or null. */
  request: () => Promise<MapPoint | null>;
  clear: () => void;
}

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 15_000,
};

function messageFor(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return `${LOCATION_DENIED} You can still type where you are.`;
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now.';
    case error.TIMEOUT:
      return 'Couldn’t get a location fix. Step near a window or outside, and try again.';
    default:
      return 'Could not read your location.';
  }
}

/**
 * A one-shot "use my current location" helper for check-in forms. Nothing runs
 * until `request()` is called (user-initiated), so no permission prompt fires on
 * page load. On success the point is stored so the form can attach it to a
 * check-in; on failure the free-text path still works.
 */
export function useCurrentLocation(): CurrentLocation {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unsupported');
      setError('This browser can’t share a location.');
      return null;
    }
    if (insecurePage()) {
      setStatus('error');
      setError(INSECURE_PAGE);
      return null;
    }
    setStatus('locating');
    setError(null);
    return new Promise<MapPoint | null>((resolve) => {
      // An unanswered prompt never calls back: say so instead of "Locating…"
      // for ever. A late answer still lands (the callbacks below run anyway).
      const waiting = window.setTimeout(() => {
        setStatus('error');
        setError(LOCATION_PROMPT_WAITING);
        resolve(null);
      }, LOCATION_PROMPT_WAIT_MS);
      locate(navigator.geolocation, OPTIONS).then(
        (pos) => {
          window.clearTimeout(waiting);
          const accuracy = pos.coords.accuracy ?? null;
          setAccuracyM(accuracy);
          // A point kilometres off would pin the check-in to the wrong place
          // and match strangers there instead of the people in the room.
          if (isApproximateFix(accuracy)) {
            setPoint(null);
            setStatus('approximate');
            setError(
              `Your device only gave an approximate location (within ${formatDistance(accuracy as number)}), so it isn’t pinned and you’ll match by the place name. Turn on Precise Location for this browser and try again.`,
            );
            resolve(null);
            return;
          }
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPoint(next);
          setError(null);
          setStatus('ready');
          resolve(next);
        },
        (err: GeolocationPositionError) => {
          window.clearTimeout(waiting);
          setStatus('error');
          setError(messageFor(err));
          resolve(null);
        },
      );
    });
  }, []);

  const clear = useCallback(() => {
    setPoint(null);
    setAccuracyM(null);
    setStatus('idle');
    setError(null);
  }, []);

  return { status, point, accuracyM, error, request, clear };
}
