import { describe, expect, it } from 'vitest';
import { looksOffline } from './offline';

describe('looksOffline', () => {
  it('trusts a browser that says it is offline, whatever the error', () => {
    expect(looksOffline(new Error('anything'), false)).toBe(true);
  });

  it.each([
    ['ChunkLoadError', 'Loading chunk 123 failed.'],
    ['TypeError', 'Failed to fetch'],
    ['TypeError', 'Load failed'],
    ['TypeError', 'NetworkError when attempting to fetch resource.'],
    ['TypeError', 'Failed to fetch dynamically imported module: /_next/static/x.js'],
  ])('reads %s “%s” as the connection, not a crash', (name, message) => {
    expect(looksOffline({ name, message }, true)).toBe(true);
  });

  it('leaves a real bug looking like a real bug', () => {
    expect(looksOffline(new TypeError('Cannot read properties of undefined'), true)).toBe(false);
  });
});
