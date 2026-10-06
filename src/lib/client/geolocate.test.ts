import { describe, expect, it } from 'vitest';
import { locate, LOW_ACCURACY_RETRY } from './geolocate';

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function failure(code: number): GeolocationPositionError {
  return { code, message: '', PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT } as GeolocationPositionError;
}

const FIX = { coords: { latitude: 39.7392, longitude: -104.9903, accuracy: 40 } } as GeolocationPosition;

/** A device that answers each request in turn with the next scripted outcome. */
function device(...outcomes: Array<GeolocationPosition | GeolocationPositionError>) {
  const asked: PositionOptions[] = [];
  return {
    asked,
    getCurrentPosition(ok: PositionCallback, fail?: PositionErrorCallback | null, options?: PositionOptions) {
      asked.push(options ?? {});
      const next = outcomes.shift();
      if (next && 'coords' in next) ok(next);
      else fail?.(next as GeolocationPositionError);
    },
  };
}

describe('locate', () => {
  it('returns a high-accuracy fix straight away', async () => {
    const phone = device(FIX);
    await expect(locate(phone, { enableHighAccuracy: true })).resolves.toBe(FIX);
    expect(phone.asked).toHaveLength(1);
  });

  it.each([
    ['times out indoors', TIMEOUT],
    ['has no GPS lock', POSITION_UNAVAILABLE],
  ])('asks once more without high accuracy when GPS %s', async (_label, code) => {
    const phone = device(failure(code), FIX);
    await expect(locate(phone, { enableHighAccuracy: true })).resolves.toBe(FIX);
    expect(phone.asked).toEqual([{ enableHighAccuracy: true }, LOW_ACCURACY_RETRY]);
  });

  it('does not ask again after a refusal', async () => {
    const phone = device(failure(PERMISSION_DENIED), FIX);
    await expect(locate(phone, { enableHighAccuracy: true })).rejects.toMatchObject({ code: PERMISSION_DENIED });
    expect(phone.asked).toHaveLength(1);
  });

  it('gives the second failure when the retry fails too', async () => {
    const phone = device(failure(TIMEOUT), failure(POSITION_UNAVAILABLE));
    await expect(locate(phone, { enableHighAccuracy: true })).rejects.toMatchObject({ code: POSITION_UNAVAILABLE });
  });
});
