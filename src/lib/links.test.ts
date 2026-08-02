import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  appInviteUrl,
  appOrigin,
  absoluteUrl,
  eventSharePath,
  eventShareUrl,
  guestRsvpUrl,
  boardJoinUrl,
} from './links';

/**
 * These cover the failure modes that actually shipped broken links, not just
 * the happy path: a missing origin, an origin with no scheme, and an origin
 * carrying a path. Each one previously produced a URL that looked fine in the
 * app and was dead in a text message.
 */

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;
const ORIGINAL_ENV = process.env.NODE_ENV;

function setEnv(appUrl: string | undefined, nodeEnv: string) {
  if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = appUrl;
  vi.stubEnv('NODE_ENV', nodeEnv);
}

afterEach(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
  vi.stubEnv('NODE_ENV', ORIGINAL_ENV ?? 'test');
  vi.unstubAllEnvs();
});

describe('appOrigin', () => {
  test('returns the configured origin', () => {
    setEnv('https://switchboardsocial.me', 'production');
    expect(appOrigin()).toBe('https://switchboardsocial.me');
  });

  test('strips a trailing slash', () => {
    setEnv('https://switchboardsocial.me/', 'production');
    expect(appOrigin()).toBe('https://switchboardsocial.me');
  });

  test('tolerates surrounding whitespace (a pasted env value)', () => {
    setEnv('  https://switchboardsocial.me  ', 'production');
    expect(appOrigin()).toBe('https://switchboardsocial.me');
  });

  test('keeps a non-default port for local/staging hosts', () => {
    setEnv('http://localhost:3001', 'production');
    expect(appOrigin()).toBe('http://localhost:3001');
  });

  test('throws in production when unset', () => {
    setEnv(undefined, 'production');
    expect(() => appOrigin()).toThrow(/must be configured/);
  });

  test('throws in production when the scheme is missing', () => {
    // "switchboardsocial.me/rsvp/<token>" does not linkify as an https URL in
    // most messaging clients, and does not resolve when it does.
    setEnv('switchboardsocial.me', 'production');
    expect(() => appOrigin()).toThrow(/absolute origin/);
  });

  test('throws in production when the origin carries a path', () => {
    setEnv('https://switchboardsocial.me/app', 'production');
    expect(() => appOrigin()).toThrow(/absolute origin/);
  });

  test('throws in production when the origin carries a query', () => {
    setEnv('https://switchboardsocial.me/?utm_source=x', 'production');
    expect(() => appOrigin()).toThrow(/absolute origin/);
  });

  test('rejects a non-http scheme', () => {
    setEnv('ftp://switchboardsocial.me', 'production');
    expect(() => appOrigin()).toThrow(/absolute origin/);
  });

  test('falls back to localhost outside production', () => {
    setEnv(undefined, 'development');
    expect(appOrigin()).toBe('http://localhost:3000');
  });
});

describe('absoluteUrl', () => {
  test('joins an app-relative path onto the origin', () => {
    setEnv('https://switchboardsocial.me', 'production');
    expect(absoluteUrl('/plans')).toBe('https://switchboardsocial.me/plans');
  });

  test('returns the bare origin for an empty path', () => {
    setEnv('https://switchboardsocial.me', 'production');
    expect(absoluteUrl()).toBe('https://switchboardsocial.me');
  });

  test('refuses a path that is not app-relative', () => {
    setEnv('https://switchboardsocial.me', 'production');
    // Guards against a caller accidentally passing an already-absolute URL and
    // producing "https://hosthttps://evil.example".
    expect(() => absoluteUrl('https://evil.example')).toThrow(/app-relative/);
  });
});

describe('link builders', () => {
  test('every share link is absolute', () => {
    setEnv('https://switchboardsocial.me', 'production');
    expect(eventShareUrl('tok')).toBe('https://switchboardsocial.me/i/tok');
    expect(guestRsvpUrl('tok')).toBe('https://switchboardsocial.me/rsvp/tok');
    expect(boardJoinUrl('abc')).toBe('https://switchboardsocial.me/boards/join/abc');
  });

  test('event share path is app-relative', () => {
    expect(eventSharePath('tok')).toBe('/i/tok');
  });

  test('board codes are URL-encoded', () => {
    setEnv('https://switchboardsocial.me', 'production');
    expect(boardJoinUrl('a b/c')).toBe(
      'https://switchboardsocial.me/boards/join/a%20b%2Fc',
    );
  });
});

describe('appInviteUrl', () => {
  test('is the bare origin, with nothing appended', () => {
    setEnv('https://switchboardsocial.me', 'production');
    expect(appInviteUrl()).toBe('https://switchboardsocial.me');
  });

  test('carries no plan, token, or query', () => {
    setEnv('https://switchboardsocial.me', 'production');
    const url = new URL(appInviteUrl());
    // The point of this link is that it is *not* an invitation to anything. A
    // token or a plan id creeping in would turn "here's the app" back into
    // "here's my event", which is the dead end it exists to remove.
    expect(url.pathname).toBe('/');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  test('fails loudly in production rather than emitting a bare path', () => {
    setEnv(undefined, 'production');
    expect(() => appInviteUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
