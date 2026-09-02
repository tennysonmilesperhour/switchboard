import { describe, expect, it } from 'vitest';
import { canAddInvitees, MAX_INVITEES_PER_EVENT } from './invite-limits';

describe('plan invite limit', () => {
  it('allows the one-hundredth invite but refuses the next one', () => {
    expect(canAddInvitees(0, MAX_INVITEES_PER_EVENT)).toBe(true);
    expect(canAddInvitees(MAX_INVITEES_PER_EVENT - 1, 1)).toBe(true);
    expect(canAddInvitees(MAX_INVITEES_PER_EVENT, 1)).toBe(false);
    expect(canAddInvitees(MAX_INVITEES_PER_EVENT - 1, 2)).toBe(false);
  });

  it('fails closed for malformed counts', () => {
    expect(canAddInvitees(-1, 1)).toBe(false);
    expect(canAddInvitees(1, 0.5)).toBe(false);
  });
});
