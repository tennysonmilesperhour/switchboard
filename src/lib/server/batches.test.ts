import { describe, expect, it } from 'vitest';
import { mapInBatches } from './batches';

describe('mapInBatches', () => {
  it('preserves order while running no more than five jobs at once', async () => {
    let active = 0;
    let peak = 0;

    const results = await mapInBatches(
      Array.from({ length: 13 }, (_, index) => index),
      async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 0));
        active -= 1;
        return value * 2;
      },
    );

    expect(peak).toBe(5);
    expect(results).toEqual(Array.from({ length: 13 }, (_, index) => index * 2));
  });

  it('rejects an invalid batch size instead of looping forever', async () => {
    await expect(mapInBatches([1], async (value) => value, 0)).rejects.toThrow(
      /positive integer/,
    );
  });
});
