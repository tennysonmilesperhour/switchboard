import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: mock.getUser }, from: mock.from }) }));
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');
  vi.stubEnv('VERCEL_ENV', 'preview');
  mock.getUser.mockResolvedValue({ data: { user: null } });
});
afterEach(() => vi.unstubAllEnvs());
test('Twilio inbound POST reaches signature authentication without a browser session', async () => {
  const result = await proxy(new NextRequest('https://switchboardsocial.me/api/sms/inbound', { method: 'POST' }));
  expect(result.status).toBe(200);
  expect(result.headers.get('location')).toBeNull();
});
test('Settings remains session-protected', async () => {
  const result = await proxy(new NextRequest('https://switchboardsocial.me/settings'));
  expect(result.status).toBe(307);
  expect(result.headers.get('location')).toContain('/welcome');
});
