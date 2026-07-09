import { describe, expect, it } from 'vitest';
import { looksLikePhoneNumber, normalizePhoneNumber } from './phone';

describe('phone normalization', () => {
  it('normalizes common US phone input to E.164', () => {
    expect(normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhoneNumber('1 555 123 4567')).toBe('+15551234567');
  });

  it('preserves explicit international numbers', () => {
    expect(normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects short or ambiguous values', () => {
    expect(normalizePhoneNumber('555-1212')).toBeNull();
    expect(looksLikePhoneNumber('@mara_host')).toBe(false);
  });
});
