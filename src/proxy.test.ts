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

test.each(['/i/token?source=text', '/join/event', '/rsvp/token'])('keeps %s public when signed out', async path => {
  signedOut();
  const response = await proxy(new NextRequest(`https://switchboardsocial.me${path}`));
  expect(response.headers.has('location')).toBe(false);
});

test.each(['/i/token?source=text', '/join/event', '/rsvp/token'])('preserves %s through onboarding and terms', async path => {
  for (const [profile, destination] of [
    [null, '/onboarding'],
    [{ onboarded: false, legal_terms_version: null }, '/onboarding'],
    [{ onboarded: true, legal_terms_version: null }, '/legal-update'],
  ] as const) {
    signedInAs({ id: 'u1' }, profile);
    const response = await proxy(new NextRequest(`https://switchboardsocial.me${path}`));
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe(destination);
    expect(location.searchParams.get('next')).toBe(path);
  }
});

test('lets an invite action reach its database eligibility check without an HTML redirect', async () => {
  signedInAs({ id: 'u1' }, { onboarded: false, legal_terms_version: null });
  const response = await proxy(new NextRequest('https://switchboardsocial.me/i/token', {
    method: 'POST', headers: { 'next-action': 'answer' },
  }));
  expect(response.headers.has('location')).toBe(false);
});

test.each(['/events/new', '/boards', '/settings'])('does not exempt a protected %s action from eligibility', async path => {
  for (const [profile, destination] of [
    [{ onboarded: false, legal_terms_version: null }, '/onboarding'],
    [{ onboarded: true, legal_terms_version: 'old' }, '/legal-update'],
  ] as const) {
    signedInAs({ id: 'u1' }, profile);
    const response = await proxy(new NextRequest(`https://switchboardsocial.me${path}`, {
      method: 'POST', headers: { 'next-action': 'protected-action' },
    }));
    expect(new URL(response.headers.get('location')!).pathname).toBe(destination);
  }
});

/** A signed-in session whose account may since have been suspended. */
function signedInAs(
  user: { id: string; banned_until?: string },
  profile: { onboarded: boolean; legal_terms_version: string | null } | null =
    { onboarded: true, legal_terms_version: LEGAL_VERSION },
) {
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
              data: profile,
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
