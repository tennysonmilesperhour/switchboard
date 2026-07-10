import { describe, expect, test } from 'vitest';
import { describeMutuals } from './relationship';

describe('describeMutuals', () => {
  test('returns null when there are no mutual friends', () => {
    expect(describeMutuals({ count: 0, names: [] })).toBeNull();
  });

  test('names a single mutual friend by first name', () => {
    expect(describeMutuals({ count: 1, names: ['Ana Ruiz'] })).toBe('Ana in common');
  });

  test('joins two mutual friends with an ampersand', () => {
    expect(describeMutuals({ count: 2, names: ['Ana', 'Ben'] })).toBe(
      'Ana & Ben in common',
    );
  });

  test('lists three shown names with a serial ampersand', () => {
    expect(describeMutuals({ count: 3, names: ['Ana', 'Ben', 'Cara'] })).toBe(
      'Ana, Ben & Cara in common',
    );
  });

  test('summarises the overflow beyond the shown names', () => {
    expect(describeMutuals({ count: 6, names: ['Ana', 'Ben', 'Cara'] })).toBe(
      'Ana, Ben, Cara & 3 others in common',
    );
  });

  test('uses the singular "other" when exactly one is hidden', () => {
    expect(describeMutuals({ count: 4, names: ['Ana', 'Ben', 'Cara'] })).toBe(
      'Ana, Ben, Cara & 1 other in common',
    );
  });
});
