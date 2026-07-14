import { describe, it, expect } from 'vitest';
import { isValidTimeZone } from './event-zone';

describe('isValidTimeZone', () => {
  it('accepts real IANA zones', () => {
    expect(isValidTimeZone('America/Denver')).toBe(true);
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects nullish and malformed values so callers never format a bad zone', () => {
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    // A stray client string must not slip through as a "zone".
    expect(isValidTimeZone('6pm')).toBe(false);
  });
});
