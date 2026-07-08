import { describe, expect, it } from 'vitest';
import {
  emailToHandleCandidate,
  identifierToAuthEmail,
  isEmailIdentifier,
  isValidUsername,
  normalizeIdentifier,
  normalizeUsername,
  usernameToAuthEmail,
} from './auth-identity';

describe('auth identity helpers', () => {
  it('normalizes usernames for auth and profile handles', () => {
    expect(normalizeUsername(' @Tennyson_01 ')).toBe('tennyson_01');
  });

  it('normalizes login identifiers without breaking emails', () => {
    expect(normalizeIdentifier(' @Tennyson_01 ')).toBe('tennyson_01');
    expect(normalizeIdentifier(' Person@Example.COM ')).toBe('person@example.com');
  });

  it('accepts app handles and rejects unsafe usernames', () => {
    expect(isValidUsername('alex_123')).toBe(true);
    expect(isValidUsername('al')).toBe(false);
    expect(isValidUsername('alex@example.com')).toBe(false);
    expect(isValidUsername('Alex!')).toBe(false);
  });

  it('detects email identifiers', () => {
    expect(isEmailIdentifier('person@example.com')).toBe(true);
    expect(isEmailIdentifier('alex_123')).toBe(false);
  });

  it('derives a private Supabase Auth email from a username', () => {
    expect(usernameToAuthEmail('Alex')).toBe('alex@users.switchboard.local');
    expect(() => usernameToAuthEmail('no spaces')).toThrow('Invalid username');
  });

  it('keeps real email identifiers as auth emails', () => {
    expect(identifierToAuthEmail('Person@Example.com')).toBe('person@example.com');
    expect(identifierToAuthEmail('@Alex')).toBe('alex@users.switchboard.local');
  });

  it('derives handle candidates from email addresses', () => {
    expect(emailToHandleCandidate('Person.Name+test@example.com')).toBe('person_name_test');
    expect(emailToHandleCandidate('x@example.com')).toBe('user_x');
  });
});
