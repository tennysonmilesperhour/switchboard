import { describe, expect, it } from 'vitest';
import { demoAccessGranted } from './demo-access';
import { MIN_PROPOSAL_TOKEN_LENGTH } from './proposal-access';

const SECRET = 'd'.repeat(MIN_PROPOSAL_TOKEN_LENGTH + 8);

describe('demoAccessGranted', () => {
  it('admits only the configured token', () => {
    expect(demoAccessGranted(SECRET, SECRET)).toBe(true);
    expect(demoAccessGranted(`${SECRET}x`, SECRET)).toBe(false);
    expect(demoAccessGranted(SECRET.slice(0, -1), SECRET)).toBe(false);
  });

  it('fails closed when the secret is unset or too short', () => {
    expect(demoAccessGranted(SECRET, undefined)).toBe(false);
    expect(demoAccessGranted('', '')).toBe(false);
    const short = 's'.repeat(MIN_PROPOSAL_TOKEN_LENGTH - 1);
    expect(demoAccessGranted(short, short)).toBe(false);
  });

  it('refuses a missing token even when a secret is set', () => {
    expect(demoAccessGranted(undefined, SECRET)).toBe(false);
    expect(demoAccessGranted('', SECRET)).toBe(false);
  });

  it('does not accept the proposal secret', () => {
    const proposal = 'p'.repeat(MIN_PROPOSAL_TOKEN_LENGTH + 8);
    expect(demoAccessGranted(proposal, SECRET)).toBe(false);
  });
});
