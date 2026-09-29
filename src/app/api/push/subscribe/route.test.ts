import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = [string, string, unknown];

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  upsertError: null as { message: string } | null,
  upserts: [] as Array<{ row: Record<string, unknown>; options: unknown }>,
  adminDeletes: [] as Filter[][],
  hasAdminCredentials: vi.fn(() => true),
  reportAndFail: vi.fn(async (code: string) => ({
    ok: false,
    code,
    error: 'Switchboard couldn’t turn on push for this device.',
    fix: null,
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: () => ({
      upsert: async (row: Record<string, unknown>, options: unknown) => {
        mocks.upserts.push({ row, options });
        return { error: mocks.upsertError };
      },
    }),
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: mocks.hasAdminCredentials,
  createAdminClient: () => ({
    from: () => ({
      delete: () => {
        const filters: Filter[] = [];
        mocks.adminDeletes.push(filters);
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push(['eq', column, value]);
            return chain;
          },
          neq: (column: string, value: unknown) => {
            filters.push(['neq', column, value]);
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  }),
}));

vi.mock('@/lib/server/observability', () => ({ reportAndFail: mocks.reportAndFail }));

import { POST } from './route';

const subscription = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
};

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mocks.user = null;
  mocks.upsertError = null;
  mocks.upserts = [];
  mocks.adminDeletes = [];
  mocks.hasAdminCredentials.mockReturnValue(true);
  mocks.reportAndFail.mockClear();
});

describe('POST /api/push/subscribe', () => {
  it('answers an expired session with a coded 401', async () => {
    const response = await post(subscription);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'SB-AUTH-EXPIRED' });
    expect(mocks.upserts).toHaveLength(0);
  });

  it('hands over a subscription only to a caller holding the same endpoint and both keys', async () => {
    mocks.user = { id: 'user-b' };
    const response = await post(subscription);

    expect(response.status).toBe(200);
    expect(mocks.adminDeletes).toEqual([
      [
        ['eq', 'endpoint', subscription.endpoint],
        ['eq', 'p256dh', subscription.keys.p256dh],
        ['eq', 'auth', subscription.keys.auth],
        ['neq', 'user_id', 'user-b'],
      ],
    ]);
    expect(mocks.upserts[0]).toEqual({
      row: {
        user_id: 'user-b',
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      options: { onConflict: 'endpoint' },
    });
  });

  it('reports a refused save with its code instead of the raw database message', async () => {
    mocks.user = { id: 'user-b' };
    mocks.upsertError = { message: 'new row violates row-level security policy' };

    const response = await post(subscription);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ ok: false, code: 'SB-PUSH-SAVE' });
    expect(JSON.stringify(body)).not.toContain('row-level security');
    expect(mocks.reportAndFail).toHaveBeenCalledWith(
      'SB-PUSH-SAVE',
      'push.subscribe',
      mocks.upsertError,
      { userId: 'user-b' },
    );
  });
});
