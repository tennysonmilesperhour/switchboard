import { describe, expect, test } from 'vitest';
import { hasInviteActivity } from './notification-nudge';

describe('notification nudge eligibility', () => {
  test('waits for a sent or received invitation', () => {
    expect(hasInviteActivity(false, false)).toBe(false);
    expect(hasInviteActivity(true, false)).toBe(true);
    expect(hasInviteActivity(false, true)).toBe(true);
  });
});
