import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * The client walks this checklist from a link they were given. It was deleted
 * once already, and the CSP would silently empty it if the nonce were dropped.
 */
describe('GET /scope-verification', () => {
  it('serves the checklist with every inline script carrying the request nonce', async () => {
    const request = new Request('https://switchboardsocial.me/scope-verification', {
      headers: { 'x-nonce': 'abc123' },
    });
    const response = await GET(request as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Scope of Work Verification');
    expect(html).toContain('September 2026 feedback round');
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain('<script nonce="abc123">');
    expect(html).not.toContain('<script src=');
  });
});
