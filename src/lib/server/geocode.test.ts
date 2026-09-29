import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkRateLimit = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit }));

import { geocode, geocodeDetailed, searchPlacesDetailed } from './geocode';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue(true);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GEOCODER_URL', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function answer(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('forward geocoding', () => {
  it('finds a place', async () => {
    answer([{ lat: '40.76', lon: '-111.89' }]);
    expect(await geocodeDetailed('Salt Lake City')).toEqual({
      status: 'found',
      point: { lat: 40.76, lng: -111.89 },
    });
  });

  it('tells "no such place" apart from "no answer"', async () => {
    answer([]);
    expect(await geocodeDetailed('Nowhere Street 99999')).toEqual({ status: 'none' });

    answer({ error: 'busy' }, 429);
    expect(await geocodeDetailed('Salt Lake City')).toEqual({ status: 'unavailable' });

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await geocodeDetailed('Salt Lake City')).toEqual({ status: 'unavailable' });
  });

  it('keeps the plain helper returning null on any miss', async () => {
    answer({}, 503);
    expect(await geocode('Salt Lake City')).toBeNull();
  });

  it('asks the configured endpoint', async () => {
    vi.stubEnv('GEOCODER_URL', 'https://geo.example.com/search');
    answer([]);
    await geocodeDetailed('Park City');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/geo\.example\.com\/search\?/);
  });
});

describe('the app-wide pace', () => {
  it('claims a shared one-per-second slot before every request', async () => {
    answer([]);
    await geocodeDetailed('Park City');
    expect(checkRateLimit).toHaveBeenCalledWith('geocoder:global', 1, 1);
  });

  it('reports the service as unavailable rather than queueing forever', async () => {
    vi.useFakeTimers();
    checkRateLimit.mockResolvedValue(false);
    const pending = geocodeDetailed('Park City');
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('place search', () => {
  it('returns null for an outage and [] for no matches', async () => {
    answer({}, 500);
    expect(await searchPlacesDetailed('Liberty Park')).toBeNull();
    answer([]);
    expect(await searchPlacesDetailed('Liberty Park')).toEqual([]);
  });

  it('never spends the shared budget on a very short query', async () => {
    expect(await searchPlacesDetailed('ab')).toEqual([]);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
