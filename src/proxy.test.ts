import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const createServerClient = vi.hoisted(() => vi.fn());
vi.mock('@supabase/ssr', () => ({ createServerClient }));
import { proxy } from './proxy';
import { LEGAL_VERSION } from '@/lib/legal';
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

const WEEK_AHEAD = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

/** A signed-in session whose account may since have been suspended. */
function signedInAs(user: { id: string; banned_until?: string }) {
  const signOut = vi.fn();
  createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: { setAll: (c: unknown[]) => void } }) => ({
      auth: {
        getUser: async () => ({ data: { user } }),
        signOut: async (args: unknown) => {
          signOut(args);
          options.cookies.setAll([
            { name: 'sb-project-auth-token', value: '', options: { path: '/', maxAge: 0 } },
          ]);
          return { error: null };
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { onboarded: true, legal_terms_version: LEGAL_VERSION },
            }),
          }),
        }),
      }),
    }),
  );
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  return { signOut };
}

test('signs a suspended session out and sends it to the sentence that names the suspension', async () => {
  const { signOut } = signedInAs({ id: 'u1', banned_until: WEEK_AHEAD() });
  const response = await proxy(new NextRequest('https://switchboardsocial.me/plans'));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('https://switchboardsocial.me/login?error=suspended');
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(response.headers.get('set-cookie')).toContain('sb-project-auth-token=;');
});

test('lets the suspended sign-in page render instead of redirecting to itself', async () => {
  signedInAs({ id: 'u1', banned_until: WEEK_AHEAD() });
  const response = await proxy(new NextRequest('https://switchboardsocial.me/login?error=suspended'));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('location')).toBe(false);
});

test('answers a suspended session calling an API with the coded refusal', async () => {
  const { signOut } = signedInAs({ id: 'u1', banned_until: WEEK_AHEAD() });
  const response = await proxy(
    new NextRequest('https://switchboardsocial.me/api/uploads/image', {
      method: 'POST',
      headers: { 'sec-fetch-mode': 'cors' },
    }),
  );
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ ok: false, code: 'SB-AUTH-SUSPENDED' });
  expect(signOut).not.toHaveBeenCalled();
});

test('leaves a Server Action from an open tab to requireUser, which names the suspension', async () => {
  signedInAs({ id: 'u1', banned_until: WEEK_AHEAD() });
  const response = await proxy(
    new NextRequest('https://switchboardsocial.me/rooms/r1', {
      method: 'POST',
      headers: { 'next-action': 'abc123' },
    }),
  );
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('location')).toBe(false);
});

test('treats a suspension that has run out as no suspension', async () => {
  const { signOut } = signedInAs({ id: 'u1', banned_until: '2020-01-01T00:00:00Z' });
  const response = await proxy(new NextRequest('https://switchboardsocial.me/plans'));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(signOut).not.toHaveBeenCalled();
});

/** What the auth server really returns for a suspended account's session. */
function bannedSession() {
  const signOut = vi.fn();
  createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: { setAll: (c: unknown[]) => void } }) => ({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { status: 403, code: 'user_banned', message: 'User is banned' },
        }),
        signOut: async (args: unknown) => {
          signOut(args);
          options.cookies.setAll([
            { name: 'sb-project-auth-token', value: '', options: { path: '/', maxAge: 0 } },
          ]);
          return { error: null };
        },
      },
    }),
  );
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  return { signOut };
}

test('reads the auth server\'s user_banned answer as a suspension, not a sign-out', async () => {
  const { signOut } = bannedSession();
  const response = await proxy(new NextRequest('https://switchboardsocial.me/plans'));
  expect(response.headers.get('location')).toBe('https://switchboardsocial.me/login?error=suspended');
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('lets a banned session\'s Server Action through to requireUser instead of redirecting it', async () => {
  bannedSession();
  const response = await proxy(
    new NextRequest('https://switchboardsocial.me/rooms/r1', {
      method: 'POST',
      headers: { 'next-action': 'abc123' },
    }),
  );
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('location')).toBe(false);
});
