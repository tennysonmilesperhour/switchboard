import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const createServerClient = vi.hoisted(() => vi.fn());
vi.mock('@supabase/ssr', () => ({ createServerClient }));
import { proxy } from './proxy';
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production');
  createServerClient.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
test.each(['/api/cron/cascade', '/api/cron/digest'])('lets the scheduler reach %s on its deployment hostname', async path => {
  const response = await proxy(new NextRequest(`https://switchboard-deployment.vercel.app${path}`));
  expect(response.status).toBe(200);
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('location')).toBe(false);
  expect(createServerClient).not.toHaveBeenCalled();
});
test.each(['/welcome', '/api/cron/other', '/api/cron-cascade'])('keeps canonical redirects for %s', async path => {
  const response = await proxy(new NextRequest(`https://switchboard-deployment.vercel.app${path}`));
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe(`https://switchboardsocial.me${path}`);
});
