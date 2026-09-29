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

function signedOut() {
  createServerClient.mockReturnValue({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
}

test('lets a guardian with no account open an approval link', async () => {
  signedOut();
  const response = await proxy(new NextRequest('https://switchboardsocial.me/approve/abc123'));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('location')).toBe(false);
});

test('answers an expired session calling an API with a coded 401, not the sign-in page', async () => {
  signedOut();
  const response = await proxy(
    new NextRequest('https://switchboardsocial.me/api/uploads/image', {
      method: 'POST',
      headers: { 'sec-fetch-mode': 'cors' },
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.has('location')).toBe(false);
  await expect(response.json()).resolves.toMatchObject({ ok: false, code: 'SB-AUTH-EXPIRED' });
});

test('still sends a signed-out browser navigation to /welcome with its deep link', async () => {
  signedOut();
  const response = await proxy(
    new NextRequest('https://switchboardsocial.me/api/events/e1/ics', {
      headers: { 'sec-fetch-mode': 'navigate' },
    }),
  );
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(
    'https://switchboardsocial.me/welcome?next=%2Fapi%2Fevents%2Fe1%2Fics',
  );
});
