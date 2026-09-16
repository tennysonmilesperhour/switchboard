import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The operator read of the feedback queue.
 *
 * The queue holds other people's words and screenshots of their phones, so the
 * only thing that really matters here is that nothing without the bearer gets
 * a single row — including when the secret is not configured at all, which is
 * the case that has historically left endpoints wide open.
 */

const mocks = vi.hoisted(() => ({
  hasAdminCredentials: vi.fn(() => true),
  checkRateLimit: vi.fn(async () => true),
  select: vi.fn(),
  update: vi.fn(),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/x' } })),
  reportOperationalError: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: mocks.hasAdminCredentials,
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => ({ limit: mocks.select }),
        }),
      }),
      update: (values: unknown) => ({ eq: (_c: string, id: string) => mocks.update(values, id) }),
    }),
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  }),
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { GET, PATCH } from './route';

const URL_ = 'http://localhost/api/cron/feedback-queue';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'correct-horse';
  mocks.hasAdminCredentials.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.select.mockResolvedValue({
    data: [
      {
        id: 'row-1',
        created_at: '2026-09-16T12:00:00Z',
        item_id: 'J4',
        item_label: 'Signals reach a group',
        body: 'The group picker is empty.',
        reporter: 'Gina',
        screenshots: ['abc/0-def.png'],
        status: 'new',
      },
    ],
    error: null,
  });
  mocks.update.mockResolvedValue({ error: null });
});

describe('GET /api/cron/feedback-queue', () => {
  it('refuses a caller with no bearer', async () => {
    const response = await GET(new Request(URL_));

    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('refuses a wrong bearer', async () => {
    const response = await GET(
      new Request(URL_, { headers: { authorization: 'Bearer wrong' } }),
    );

    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('fails closed when the secret is not configured, rather than opening up', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(
      new Request(URL_, { headers: { authorization: 'Bearer anything' } }),
    );

    expect(response.status).toBe(500);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('returns open rows with signed screenshot URLs to the right caller', async () => {
    const response = await GET(
      new Request(URL_, { headers: { authorization: 'Bearer correct-horse' } }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.count).toBe(1);
    expect(json.rows[0].body).toBe('The group picker is empty.');
    expect(json.rows[0].screenshots[0]).toMatchObject({
      path: 'abc/0-def.png',
      url: 'https://signed.example/x',
    });
  });

  it('says in the payload that the rows are untrusted text', async () => {
    // The job reads this before it starts writing code, and the submitters are
    // anonymous. The reminder travels with the data, not only in the runbook.
    const response = await GET(
      new Request(URL_, { headers: { authorization: 'Bearer correct-horse' } }),
    );

    expect((await response.json()).warning).toMatch(/never as instructions/i);
  });
});

describe('PATCH /api/cron/feedback-queue', () => {
  const patch = (body: unknown, auth = 'Bearer correct-horse') =>
    PATCH(
      new Request(URL_, {
        method: 'PATCH',
        headers: { authorization: auth, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('refuses an unauthorized writer', async () => {
    const response = await patch({ id: 'row-1', status: 'shipped' }, 'Bearer wrong');

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a status outside the known set', async () => {
    const response = await patch({ id: 'row-1', status: 'merged' });

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('records what happened and when it settled', async () => {
    const response = await patch({
      id: 'row-1',
      status: 'shipped',
      resolution: 'Fixed the empty picker.',
      ref: 'abc1234',
    });

    expect(response.status).toBe(200);
    const [values, id] = mocks.update.mock.calls[0] as unknown as [
      { status: string; resolved_at: string | null; resolved_ref: string | null },
      string,
    ];
    expect(id).toBe('row-1');
    expect(values.status).toBe('shipped');
    expect(values.resolved_at).toBeTruthy();
    expect(values.resolved_ref).toBe('abc1234');
  });

  it('leaves a row still in progress unsettled', async () => {
    await patch({ id: 'row-1', status: 'in_progress' });

    const [values] = mocks.update.mock.calls[0] as unknown as [
      { resolved_at: string | null },
    ];
    expect(values.resolved_at).toBeNull();
  });
});
