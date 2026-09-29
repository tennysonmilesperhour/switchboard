import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  appInviteUrl,
  appOrigin,
  appOriginOrUndefined,
  absoluteUrl,
  calendarFeedUrl,
  eventSharePath,
  eventShareUrl,
  guestRsvpUrl,
  boardJoinUrl,
  webcalSubscribeUrl,
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

describe('appOriginOrUndefined', () => {
  // The root layout's metadataBase, robots.txt and sitemap.xml read the origin
  // on every page or at build time. A throw there takes the whole app down, so
  // this accessor must degrade to "no origin" — never to a guessed host.
  test('returns the configured origin', () => {
    setEnv('https://switchboardsocial.me/', 'production');
    expect(appOriginOrUndefined()).toBe('https://switchboardsocial.me');
  });

  test('returns undefined, not a throw or localhost, when unset in production', () => {
    setEnv(undefined, 'production');
    expect(appOriginOrUndefined()).toBeUndefined();
  });

  test('returns undefined when malformed in production', () => {
    setEnv('switchboardsocial.me', 'production');
    expect(appOriginOrUndefined()).toBeUndefined();
  });
});

describe('calendar subscription links', () => {
  const TOKEN = 'd9793867-2963-4c92-bad0-6a2ea04f895f';

  test('roots the feed at the configured origin', () => {
    setEnv('https://switchboardsocial.me/', 'production');
    expect(calendarFeedUrl(TOKEN)).toBe(
      `https://switchboardsocial.me/api/calendar/${TOKEN}`,
    );
  });

  test('webcal swaps only the scheme, preserving host and path', () => {
    setEnv('https://switchboardsocial.me', 'production');
    expect(webcalSubscribeUrl(TOKEN)).toBe(
      `webcal://switchboardsocial.me/api/calendar/${TOKEN}`,
    );
  });

  test('also rewrites a plain-http origin (e.g. local dev)', () => {
    setEnv('http://localhost:3000', 'development');
    expect(webcalSubscribeUrl(TOKEN)).toBe(
      `webcal://localhost:3000/api/calendar/${TOKEN}`,
    );
  });

  test('fails loudly in production rather than rooting at the page host', () => {
    // The old builder took any origin and the settings page fed it
    // window.location.origin, so a preview host became a dead subscription.
    setEnv(undefined, 'production');
    expect(() => calendarFeedUrl(TOKEN)).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(() => webcalSubscribeUrl(TOKEN)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
