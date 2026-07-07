import { describe, expect, test } from 'vitest';
import { looksLikeEmail } from './email';

describe('looksLikeEmail', () => {
  test('accepts ordinary addresses', () => {
    expect(looksLikeEmail('sam@example.com')).toBe(true);
    expect(looksLikeEmail('a.b+tag@sub.domain.org')).toBe(true);
    expect(looksLikeEmail('  spaced@example.com  ')).toBe(true);
  });

  test('rejects phone numbers and junk', () => {
    expect(looksLikeEmail('+1 555 123 4567')).toBe(false);
    expect(looksLikeEmail('not-an-email')).toBe(false);
    expect(looksLikeEmail('missing@domain')).toBe(false);
    expect(looksLikeEmail('@nolocal.com')).toBe(false);
  });

  test('rejects empty / null', () => {
    expect(looksLikeEmail(null)).toBe(false);
    expect(looksLikeEmail(undefined)).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});
