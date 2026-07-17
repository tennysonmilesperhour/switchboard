'use client';

import { useCallback, useState } from 'react';
import type { MapPoint } from '@/lib/geo';

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'error' | 'unsupported';

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
      return 'Location permission denied. You can still type where you are.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now.';
    case error.TIMEOUT:
      return 'Timed out getting your location.';
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
    setStatus('locating');
    setError(null);
    return new Promise<MapPoint | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPoint(next);
          setAccuracyM(pos.coords.accuracy ?? null);
          setStatus('ready');
          resolve(next);
        },
        (err) => {
          setStatus('error');
          setError(messageFor(err));
          resolve(null);
        },
        OPTIONS,
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
