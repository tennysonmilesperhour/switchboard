import { describe, expect, it } from 'vitest';

import { buildCsp, supabaseConnectSources } from '@/lib/csp';

/**
 * A CSP that is wrong fails silently. Nothing throws, no request 500s, nothing
 * is logged server-side — the browser refuses the connection and writes one
 * line to a console nobody is reading. `connect-src` was pinned to
 * `*.supabase.co` for over a month, which meant realtime never connected on a
 * local stack or in CI, and the only trace of it was a message in a CI browser
 * that surfaced by accident while chasing an unrelated test.
 */
describe('supabaseConnectSources', () => {
  it('allows the configured project and its websocket, not every project', () => {
    const sources = supabaseConnectSources('https://abcdefgh.supabase.co');
    expect(sources).toBe('https://abcdefgh.supabase.co wss://abcdefgh.supabase.co');
    expect(sources, 'the wildcard authorises every Supabase project on the internet').not.toContain(
      '*',
    );
  });

  it('allows a local stack over plain ws — the case the wildcard silently blocked', () => {
    // What `supabase start` serves, and what CI runs the whole authenticated
    // suite against.
    expect(supabaseConnectSources('http://127.0.0.1:54321')).toBe(
      'http://127.0.0.1:54321 ws://127.0.0.1:54321',
    );
  });

  it('keeps a trailing path out of the directive — CSP sources are origins', () => {
    expect(supabaseConnectSources('https://abcdefgh.supabase.co/rest/v1')).toBe(
      'https://abcdefgh.supabase.co wss://abcdefgh.supabase.co',
    );
  });

  it('falls back to the wildcard rather than emitting a broken directive', () => {
    // A build with no Supabase URL has larger problems than its CSP; what
    // matters is that the header stays parseable.
    for (const bad of [undefined, '', 'not a url']) {
      expect(supabaseConnectSources(bad)).toBe('https://*.supabase.co wss://*.supabase.co');
    }
  });
});

describe('buildCsp', () => {
  const csp = (options?: Parameters<typeof buildCsp>[1]) => buildCsp('n0nce', options);

  it('carries the nonce and refuses inline script in production', () => {
    const policy = csp({ isDev: false });
    expect(policy).toContain("script-src 'self' 'nonce-n0nce'");
    expect(policy).not.toContain("'unsafe-inline' 'nonce-n0nce'");
    expect(policy, "eval is a dev-only allowance for React's overlays").not.toContain(
      "'unsafe-eval'",
    );
  });

  it('allows eval only in development', () => {
    expect(csp({ isDev: true })).toContain("'unsafe-eval'");
  });

  it('reaches Supabase over the origin the app was actually built against', () => {
    expect(csp({ supabaseUrl: 'http://127.0.0.1:54321' })).toContain(
      "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321",
    );
  });

  it('keeps the directives that make an injected script useless', () => {
    const policy = csp({ isDev: false });
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
    ]) {
      expect(policy).toContain(directive);
    }
  });
});
