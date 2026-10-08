import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ collect: vi.fn(), rateLimit: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/server/external-event-collector', () => ({ collectExternalEvents: mocks.collect }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));

import { GET } from './route';

function request(secret = 'test-secret') {
  return new Request('http://localhost/api/cron/external-events', { headers: { Authorization: `Bearer ${secret}` } });
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  mocks.rateLimit.mockResolvedValue(true);
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: null, error: null });
  mocks.collect.mockResolvedValue({ sources: 2, succeeded: 2, failed: 0, backedOff: 0, found: 20, accepted: 18, rejected: 2, stale: 1, catalogued: 17, submissionsAccepted: 1, submissionsNeedsReview: 1 });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
});

describe('external event cron', () => {
  it('fails closed without the cron secret', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(500);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it('returns the collection summary', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sources: 2, succeeded: 2, failed: 0, backedOff: 0, found: 20, accepted: 18, rejected: 2, stale: 1, catalogued: 17, submissionsAccepted: 1, submissionsNeedsReview: 1 });
  });

  it('skips an overlapping invocation', async () => {
    mocks.rpc.mockReset().mockResolvedValueOnce({ data: false, error: null });
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, skipped: 'overlap' });
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});
