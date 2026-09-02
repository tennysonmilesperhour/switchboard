import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasAdminCredentials: vi.fn(),
  rpc: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: mocks.hasAdminCredentials,
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { checkRateLimit } from './rate-limit';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasAdminCredentials.mockReturnValue(true);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe('checkRateLimit failure modes', () => {
  it('fails closed for auth and upload callers when limiter state is unavailable', async () => {
    mocks.hasAdminCredentials.mockReturnValue(false);

    await expect(
      checkRateLimit('signin:ip:203.0.113.7', 30, 600, { failClosed: true }),
    ).resolves.toBe(false);
    await expect(
      checkRateLimit('upload:user-1', 30, 3600, { failClosed: true }),
    ).resolves.toBe(false);
  });

  it('preserves explicit fail-open behavior for low-risk best-effort paths', async () => {
    mocks.hasAdminCredentials.mockReturnValue(false);

    await expect(checkRateLimit('cron:cascade', 5, 60)).resolves.toBe(true);
  });

  it('reports RPC failures and honors the caller failure mode', async () => {
    const error = { message: 'database unavailable', code: '08006' };
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(
      checkRateLimit('reset:alice@example.com', 3, 3600, { failClosed: true }),
    ).resolves.toBe(false);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'rate-limit',
      error,
      { scope: 'reset', failClosed: true },
    );
  });
});
