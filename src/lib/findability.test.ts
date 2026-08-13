import { describe, expect, it } from 'vitest';
import { findabilityState, findabilitySettled } from './findability';

/**
 * The rule that matters: never send someone to a door that won't open, and
 * never nag someone who is already findable.
 */

const BOTH = { email: true, phone: true };
const NEITHER = { email: false, phone: false };

describe('findabilityState', () => {
  it('stays quiet once any detail is verified', () => {
    expect(
      findabilityState({
        contacts: [
          { kind: 'email', verified: true },
          { kind: 'phone', verified: false },
        ],
        canDeliver: BOTH,
      }),
    ).toEqual({ kind: 'findable' });
  });

  it('asks for verification when a detail is on file', () => {
    expect(
      findabilityState({
        contacts: [{ kind: 'email', verified: false }],
        canDeliver: BOTH,
      }),
    ).toEqual({ kind: 'verify', contact: 'email' });
  });

  it('prefers the email link when both are unverified', () => {
    expect(
      findabilityState({
        contacts: [
          { kind: 'phone', verified: false },
          { kind: 'email', verified: false },
        ],
        canDeliver: BOTH,
      }),
    ).toEqual({ kind: 'verify', contact: 'email' });
  });

  it('asks for the phone when only SMS is configured', () => {
    expect(
      findabilityState({
        contacts: [
          { kind: 'email', verified: false },
          { kind: 'phone', verified: false },
        ],
        canDeliver: { email: false, phone: true },
      }),
    ).toEqual({ kind: 'verify', contact: 'phone' });
  });

  it('asks for a detail to be added when nothing is on file', () => {
    expect(findabilityState({ contacts: [], canDeliver: BOTH })).toEqual({
      kind: 'add',
    });
  });

  it('asks for a detail it can actually verify, not the one on file', () => {
    // A phone it can never send a code to is not a route to being findable;
    // adding the email this deployment *can* verify is.
    expect(
      findabilityState({
        contacts: [{ kind: 'phone', verified: false }],
        canDeliver: { email: true, phone: false },
      }),
    ).toEqual({ kind: 'add' });
  });

  it('says nothing at all when no channel can be delivered', () => {
    for (const contacts of [
      [],
      [{ kind: 'email' as const, verified: false }],
      [{ kind: 'phone' as const, verified: false }],
    ]) {
      expect(findabilityState({ contacts, canDeliver: NEITHER })).toEqual({
        kind: 'unavailable',
      });
    }
  });

  it('still reports findable when a verified detail exists but nothing can be sent', () => {
    expect(
      findabilityState({
        contacts: [{ kind: 'email', verified: true }],
        canDeliver: NEITHER,
      }),
    ).toEqual({ kind: 'findable' });
  });
});

describe('findabilitySettled', () => {
  it('counts findable and unavailable as done, so the checklist can retire', () => {
    expect(findabilitySettled({ kind: 'findable' })).toBe(true);
    expect(findabilitySettled({ kind: 'unavailable' })).toBe(true);
    expect(findabilitySettled({ kind: 'verify', contact: 'email' })).toBe(false);
    expect(findabilitySettled({ kind: 'add' })).toBe(false);
  });
});
