import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  ContactMatchRateLimitError,
  isContactMatchRateLimit,
  resolveProfileByContact,
} from './event-action-shared';

function clientReturning(result: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn(() => ({ maybeSingle: vi.fn(async () => result) })),
  } as never;
}

describe('resolveProfileByContact', () => {
  it('returns the match when the oracle finds one', async () => {
    const supabase = clientReturning({
      data: { id: 'user-2', display_name: 'Mallory', handle: 'mallory' },
      error: null,
    });
    await expect(resolveProfileByContact(supabase, 'mallory@example.com')).resolves.toEqual({
      id: 'user-2',
      name: 'Mallory',
    });
  });

  it('returns null for no match, which is what a throttle used to look like', async () => {
    const supabase = clientReturning({ data: null, error: null });
    await expect(resolveProfileByContact(supabase, 'nobody@example.com')).resolves.toBeNull();
  });

  it('throws the rate-limit error when the database bucket is spent', async () => {
    const supabase = clientReturning({
      data: null,
      error: { message: 'contact-match rate limit', hint: 'SB-RATE-LIMIT', code: 'P0001' },
    });
    await expect(resolveProfileByContact(supabase, 'mallory@example.com')).rejects.toBeInstanceOf(
      ContactMatchRateLimitError,
    );
  });
});

describe('isContactMatchRateLimit', () => {
  it('recognises the database hint, the message, and the thrown class', () => {
    expect(isContactMatchRateLimit({ hint: 'SB-RATE-LIMIT' })).toBe(true);
    expect(isContactMatchRateLimit({ message: 'P0001: contact-match rate limit' })).toBe(true);
    expect(isContactMatchRateLimit(new ContactMatchRateLimitError())).toBe(true);
  });

  it('ignores every other error', () => {
    expect(isContactMatchRateLimit(new Error('network'))).toBe(false);
    expect(isContactMatchRateLimit({ message: 'permission denied' })).toBe(false);
    expect(isContactMatchRateLimit(null)).toBe(false);
  });
});
