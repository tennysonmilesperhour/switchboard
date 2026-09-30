import { describe, expect, it } from 'vitest';
import {
  SUSPENDED_LOGIN_PATH,
  isOpenEndedSuspension,
  isSuspendedUser,
  isSuspensionDays,
  suspensionLabel,
} from './suspension';

const NOW = Date.parse('2026-09-29T12:00:00Z');

describe('isSuspendedUser', () => {
  it('is false for an account that was never banned', () => {
    expect(isSuspendedUser({}, NOW)).toBe(false);
    expect(isSuspendedUser({ banned_until: null }, NOW)).toBe(false);
    expect(isSuspendedUser(null, NOW)).toBe(false);
  });

  it('is true while the ban runs', () => {
    expect(isSuspendedUser({ banned_until: '2026-10-06T12:00:00Z' }, NOW)).toBe(true);
  });

  it('lets a suspension that ran out go, the way the auth server does', () => {
    expect(isSuspendedUser({ banned_until: '2026-09-28T12:00:00Z' }, NOW)).toBe(false);
  });

  it('does not read an unparseable value as a suspension', () => {
    expect(isSuspendedUser({ banned_until: 'none' }, NOW)).toBe(false);
  });
});

describe('suspension durations', () => {
  it('accepts only the offered choices', () => {
    expect(isSuspensionDays(7)).toBe(true);
    expect(isSuspensionDays(30)).toBe(true);
    expect(isSuspensionDays(null)).toBe(true);
    expect(isSuspensionDays(3650)).toBe(false);
    expect(isSuspensionDays('7')).toBe(false);
    expect(isSuspensionDays(undefined)).toBe(false);
  });

  it('reads a century-long ban as open-ended and a week as dated', () => {
    expect(isOpenEndedSuspension('2126-09-29T12:00:00Z', NOW)).toBe(true);
    expect(isOpenEndedSuspension('2026-10-06T12:00:00Z', NOW)).toBe(false);
    expect(suspensionLabel('2126-09-29T12:00:00Z', NOW)).toBe('until a moderator lifts it');
    expect(suspensionLabel('2026-10-06T12:00:00Z', NOW, 'UTC')).toBe('until Oct 6');
    expect(suspensionLabel('2027-01-06T12:00:00Z', NOW, 'UTC')).toBe('until Jan 6, 2027');
  });
});

it('sends a suspended person to the sign-in page that names the suspension', () => {
  expect(SUSPENDED_LOGIN_PATH).toBe('/login?error=suspended');
});
