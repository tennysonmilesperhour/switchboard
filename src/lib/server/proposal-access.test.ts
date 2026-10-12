import { describe, expect, it } from 'vitest';
import { MIN_PROPOSAL_TOKEN_LENGTH, proposalAccessGranted } from './proposal-access';

const SECRET = 'k'.repeat(MIN_PROPOSAL_TOKEN_LENGTH + 8);

describe('proposalAccessGranted', () => {
  it('admits only the configured token', () => {
    expect(proposalAccessGranted(SECRET, SECRET)).toBe(true);
    expect(proposalAccessGranted(`${SECRET}x`, SECRET)).toBe(false);
    expect(proposalAccessGranted(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(proposalAccessGranted('a'.repeat(SECRET.length), SECRET)).toBe(false);
  });

  it('fails closed when the secret is unset, empty or too short', () => {
    expect(proposalAccessGranted(SECRET, undefined)).toBe(false);
    expect(proposalAccessGranted('', '')).toBe(false);
    const short = 's'.repeat(MIN_PROPOSAL_TOKEN_LENGTH - 1);
    expect(proposalAccessGranted(short, short)).toBe(false);
  });

  it('refuses a missing token even when a secret is set', () => {
    expect(proposalAccessGranted(undefined, SECRET)).toBe(false);
    expect(proposalAccessGranted(null, SECRET)).toBe(false);
    expect(proposalAccessGranted('', SECRET)).toBe(false);
  });
});
