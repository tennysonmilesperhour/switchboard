import { describe, expect, test } from 'vitest';

import { isFetchableUrl, isPrivateAddress } from './net-guard';

describe('isPrivateAddress', () => {
  test('blocks loopback and the unspecified address', () => {
    for (const address of ['127.0.0.1', '127.1.1.1', '0.0.0.0', '::1', '::']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  test('blocks cloud instance metadata', () => {
    // The one that turns an SSRF into stolen credentials on every major cloud.
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
  });

  test('blocks the RFC 1918 ranges, including their edges', () => {
    for (const address of [
      '10.0.0.0', '10.255.255.255',
      '172.16.0.1', '172.31.255.255',
      '192.168.0.1', '192.168.255.255',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  test('lets the addresses just outside those ranges through', () => {
    // An off-by-one here would either break real calendars or open the hole.
    for (const address of ['172.15.255.255', '172.32.0.1', '11.0.0.1', '192.167.255.255']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  test('blocks carrier-grade NAT, benchmarking, multicast and reserved space', () => {
    for (const address of ['100.64.0.1', '198.18.0.1', '224.0.0.1', '240.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  test('blocks IPv6 loopback written as a mapped IPv4 address', () => {
    // Same host, three spellings. Judging only the outer form would wave the
    // last two straight through.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true);
    expect(isPrivateAddress('[::ffff:169.254.169.254]')).toBe(true);
  });

  test('blocks IPv6 unique-local and link-local prefixes', () => {
    for (const address of ['fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  test('allows ordinary public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '142.250.72.14', '2606:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

describe('isFetchableUrl', () => {
  test('accepts an ordinary calendar link', () => {
    const result = isFetchableUrl('https://calendar.google.com/calendar/ical/abc/basic.ics');
    expect(result.ok).toBe(true);
  });

  test('rewrites webcal:, which is how calendars are usually published', () => {
    const result = isFetchableUrl('webcal://p01.calendar.example.com/feed.ics');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.protocol).toBe('https:');
  });

  test('refuses schemes a server should never follow', () => {
    for (const raw of ['file:///etc/passwd', 'gopher://x/1', 'ftp://x/y', 'data:text/plain,hi']) {
      expect(isFetchableUrl(raw).ok, raw).toBe(false);
    }
  });

  test('refuses localhost and literal private addresses', () => {
    for (const raw of [
      'http://localhost:5432/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
    ]) {
      expect(isFetchableUrl(raw).ok, raw).toBe(false);
    }
  });

  test('refuses nonsense rather than throwing', () => {
    expect(isFetchableUrl('not a url').ok).toBe(false);
    expect(isFetchableUrl('').ok).toBe(false);
  });
});
