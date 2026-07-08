import { describe, expect, it } from 'vitest';
import {
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from './auth-identity';

describe('auth identity helpers', () => {
  it('normalizes usernames for auth and profile handles', () => {
    expect(normalizeUsername(' @Tennyson_01 ')).toBe('tennyson_01');
  });

  it('accepts app handles and rejects unsafe usernames', () => {
    expect(isValidUsername('alex_123')).toBe(true);
    expect(isValidUsername('al')).toBe(false);
    expect(isValidUsername('alex@example.com')).toBe(false);
    expect(isValidUsername('Alex!')).toBe(false);
  });

  it('derives a private Supabase Auth email from a username', () => {
    expect(usernameToAuthEmail('Alex')).toBe('alex@users.switchboard.local');
    expect(() => usernameToAuthEmail('no spaces')).toThrow('Invalid username');
  });
});
