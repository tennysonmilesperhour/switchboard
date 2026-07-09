import { describe, it, expect } from 'vitest';
import { parseInviteEntry, parseInviteEntries } from './invite-entry';

describe('parseInviteEntry', () => {
  it('returns null for blank input', () => {
    expect(parseInviteEntry('')).toBeNull();
    expect(parseInviteEntry('   ')).toBeNull();
  });

  it('parses an @-prefixed handle, lowercased and stripped', () => {
    expect(parseInviteEntry('@Sarah_B')).toEqual({
      kind: 'handle',
      value: 'sarah_b',
      display: '@sarah_b',
    });
  });

  it('rejects an @-token that is not a valid handle', () => {
    expect(parseInviteEntry('@no')).toBeNull(); // too short
    expect(parseInviteEntry('@has spaces')).toBeNull();
    expect(parseInviteEntry('@bad!chars')).toBeNull();
  });

  it('detects an email and lowercases it', () => {
    expect(parseInviteEntry('Jamie@Example.COM')).toEqual({
      kind: 'email',
      value: 'jamie@example.com',
      display: 'jamie@example.com',
    });
  });

  it('detects and normalizes a phone number to E.164', () => {
    expect(parseInviteEntry('(415) 555-0134')).toEqual({
      kind: 'phone',
      value: '+14155550134',
      display: '(415) 555-0134',
    });
  });

  it('treats a bare word or full name as a guest name', () => {
    expect(parseInviteEntry('Sarah')).toEqual({
      kind: 'name',
      value: 'Sarah',
      display: 'Sarah',
    });
    expect(parseInviteEntry('  Jane Doe  ')).toEqual({
      kind: 'name',
      value: 'Jane Doe',
      display: 'Jane Doe',
    });
  });

  it('does not treat a bare handle-shaped word as a handle (needs @)', () => {
    // Ambiguous with a name, so without @ it is a guest name.
    expect(parseInviteEntry('sarah_b')?.kind).toBe('name');
  });

  it('caps a very long name', () => {
    const long = 'a'.repeat(200);
    expect(parseInviteEntry(long)?.value).toHaveLength(80);
  });
});

describe('parseInviteEntries', () => {
  it('drops blanks and de-duplicates by kind+value', () => {
    const result = parseInviteEntries([
      '@sarah',
      '@Sarah', // same handle, different case
      '',
      'jamie@example.com',
      'JAMIE@example.com', // same email
      'Guest Name',
    ]);
    expect(result.map((r) => `${r.kind}:${r.value}`)).toEqual([
      'handle:sarah',
      'email:jamie@example.com',
      'name:Guest Name',
    ]);
  });
});
