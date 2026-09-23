import { describe, expect, it } from 'vitest';
import { CAPACITY_MESSAGE, capacityProblem } from './plan-capacity';

describe('capacityProblem', () => {
  it.each(['', '   ', null, undefined])('lets a blank capacity through (%s)', (value) => {
    expect(capacityProblem(value)).toBeNull();
  });

  it.each(['1', '8', ' 12 ', 40])('accepts a whole number of at least one (%s)', (value) => {
    expect(capacityProblem(value)).toBeNull();
  });

  /**
   * Each of these used to reach `create_event_atomic` and fail there as a
   * CHECK violation or an integer cast error, shown to the host as a generic
   * "Something went wrong publishing your plan".
   */
  it.each(['0', '-2', '2.5', 'abc', 0, -1, 1.5])('refuses %s with a sentence', (value) => {
    expect(capacityProblem(value)).toBe(CAPACITY_MESSAGE);
  });
});
