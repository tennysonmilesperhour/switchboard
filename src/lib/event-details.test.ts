import { describe, expect, test } from 'vitest';
import { hasInviteDetails } from './event-details';

describe('hasInviteDetails', () => {
  test('accepts either a location or a description', () => {
    expect(hasInviteDetails('Café Luna', null)).toBe(true);
    expect(hasInviteDetails(null, 'Come by for dinner after work.')).toBe(true);
  });

  test('rejects a title-and-time-only invitation', () => {
    expect(hasInviteDetails(null, null)).toBe(false);
    expect(hasInviteDetails('   ', '\n  ')).toBe(false);
  });
});
