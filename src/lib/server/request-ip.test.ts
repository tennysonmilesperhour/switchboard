import { describe, expect, it } from 'vitest';

import { clientIpFromHeaders, forwardedClientIp } from './request-ip';

describe('forwardedClientIp', () => {
  it('uses the first proxy hop and normalizes it', () => {
    expect(forwardedClientIp('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7');
    expect(forwardedClientIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('collapses missing or hostile values to one inert bucket', () => {
    expect(forwardedClientIp(null)).toBe('unknown');
    expect(forwardedClientIp('127.0.0.1\nspoof')).toBe('unknown');
    expect(forwardedClientIp('not-an-ip')).toBe('unknown');
  });

  it('prefers Vercel ingress identity over a proxy-supplied fallback', () => {
    const requestHeaders = new Headers({
      'x-vercel-forwarded-for': '203.0.113.7',
      'x-forwarded-for': '198.51.100.9',
      'x-real-ip': '192.0.2.4',
    });

    expect(clientIpFromHeaders(requestHeaders)).toBe('203.0.113.7');
  });
});
