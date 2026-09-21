import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The scope checklist's shared board.
 *
 * Two things this has to get right, and they pull in opposite directions:
 *
 *   * It is **deliberately public for reading**. The whole complaint it answers
 *     is that progress and notes were invisible to the person who sent the link,
 *     so a test that demanded auth here would be testing the bug.
 *   * It is an **open write endpoint**, so the bounds and the limiters are the
 *     only things standing between it and an unbounded table.
 */

const mocks = vi.hoisted(() => ({
  hasAdminCredentials: vi.fn(() => true),
  checkRateLimit: vi.fn(async () => true),
  progressSelect: vi.fn(),
  notesSelect: vi.fn(),
  countSelect: vi.fn(async () => ({ count: 3 })),
  upsert: vi.fn(async () => ({ error: null as unknown })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/s.png' } })),
  reportOperationalError: vi.fn(),
  notifyProgress: vi.fn(async () => 'sent'),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: mocks.hasAdminCredentials,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { head?: boolean }) => {
        if (table === 'scope_progress' && opts?.head) {
          return { eq: mocks.countSelect };
        }
        if (table === 'scope_progress') {
          return { eq: mocks.progressSelect };
        }
        return { order: () => ({ limit: mocks.notesSelect }) };
      },
      upsert: mocks.upsert,
    }),
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  }),
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));
vi.mock('@/lib/server/scope-watch', () => ({ notifyProgress: mocks.notifyProgress }));

import { GET, POST } from './route';

const URL_ = 'http://localhost/api/scope-progress';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasAdminCredentials.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.countSelect.mockResolvedValue({ count: 3 });
  mocks.progressSelect.mockResolvedValue({
    data: [
      { item_id: 'A1', checked: true, updated_at: '2026-09-20T10:00:00Z', updated_by: 'Gina' },
      { item_id: 'J4', checked: true, updated_at: '2026-09-20T11:00:00Z', updated_by: null },
    ],
    error: null,
  });
  mocks.notesSelect.mockResolvedValue({
    data: [
      {
        id: 'n1',
        created_at: '2026-09-20T12:00:00Z',
        item_id: 'J4',
        item_label: 'Signals reach a group',
        body: 'The group picker is empty.',
        reporter: 'Gina',
        screenshots: ['abc/0-def.png'],
        status: 'needs_you',
        resolution: null,
      },
    ],
    error: null,
  });
});

describe('GET /api/scope-progress', () => {
  it('serves the board to someone with no session, because that is the point', async () => {
    const response = await GET(new Request(URL_));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.checked.A1).toMatchObject({ by: 'Gina' });
    expect(json.checked.J4).toMatchObject({ by: null });
    expect(json.notes[0]).toMatchObject({
      body: 'The group picker is empty.',
      reporter: 'Gina',
      itemId: 'J4',
    });
  });

  it('hands back signed screenshot URLs rather than raw paths', async () => {
    const response = await GET(new Request(URL_));
    const json = await response.json();

    // Viewable without the bucket being listable.
    expect(json.notes[0].screenshots).toEqual(['https://signed.example/s.png']);
    expect(JSON.stringify(json)).not.toContain('abc/0-def.png');
  });

  it('is never cached, or it would show a stale board', async () => {
    const response = await GET(new Request(URL_));
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('asks crawlers not to index it', async () => {
    const response = await GET(new Request(URL_));
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('says so with a code when the server is not configured for it', async () => {
    mocks.hasAdminCredentials.mockReturnValue(false);
    const response = await GET(new Request(URL_));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'SB-SCOPE-BOARD' });
  });

  it('reports a read failure instead of pretending the board is empty', async () => {
    mocks.progressSelect.mockResolvedValue({ data: null, error: { message: 'down' } });
    const response = await GET(new Request(URL_));

    expect(response.status).toBe(500);
    expect(mocks.reportOperationalError).toHaveBeenCalled();
  });
});

describe('POST /api/scope-progress', () => {
  it('records a tick and who made it', async () => {
    const response = await post({ itemId: 'J4', checked: true, name: 'Gina', total: 35 });

    expect(response.status).toBe(200);
    const [row] = mocks.upsert.mock.calls[0] as unknown as [
      { item_id: string; checked: boolean; updated_by: string | null },
    ];
    expect(row).toMatchObject({ item_id: 'J4', checked: true, updated_by: 'Gina' });
  });

  it('records an untick too', async () => {
    await post({ itemId: 'J4', checked: false });
    const [row] = mocks.upsert.mock.calls[0] as unknown as [{ checked: boolean }];
    expect(row.checked).toBe(false);
  });

  it('accepts an anonymous tick', async () => {
    await post({ itemId: 'A1', checked: true });
    const [row] = mocks.upsert.mock.calls[0] as unknown as [{ updated_by: string | null }];
    expect(row.updated_by).toBeNull();
  });

  describe('what it refuses to write', () => {
    it.each([
      ['a key that is not a checklist id', { itemId: 'DROP TABLE', checked: true }],
      ['an empty id', { itemId: '', checked: true }],
      ['an id with no number', { itemId: 'A', checked: true }],
      ['an absurdly long id', { itemId: 'A'.repeat(40), checked: true }],
      ['a missing checked flag', { itemId: 'A1' }],
      ['a non-boolean checked flag', { itemId: 'A1', checked: 'yes' }],
    ])('refuses %s', async (_label, body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('refuses a body that is not JSON', async () => {
      const response = await POST(
        new Request(URL_, { method: 'POST', body: 'not json' }),
      );
      expect(response.status).toBe(400);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('bounds the name rather than storing whatever arrives', async () => {
      await post({ itemId: 'A1', checked: true, name: 'z'.repeat(400) });
      const [row] = mocks.upsert.mock.calls[0] as unknown as [{ updated_by: string }];
      expect(row.updated_by).toHaveLength(80);
    });
  });

  describe('rate limiting', () => {
    it('consults a global bucket and a per-address bucket, both fail-closed', async () => {
      await post({ itemId: 'A1', checked: true }, { 'x-vercel-forwarded-for': '203.0.113.9' });

      const calls = mocks.checkRateLimit.mock.calls as unknown as [
        string,
        number,
        number,
        { failClosed?: boolean },
      ][];
      expect(calls[0][0]).toBe('scope-progress:write:all');
      expect(calls[1][0]).toContain('203.0.113.9');
      for (const call of calls) expect(call[3]).toMatchObject({ failClosed: true });
    });

    it('writes nothing once a bucket is spent', async () => {
      mocks.checkRateLimit.mockResolvedValueOnce(false);
      const response = await post({ itemId: 'A1', checked: true });

      expect(response.status).toBe(429);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });
  });

  it('tells the owner, and never lets that failure lose the tick', async () => {
    mocks.notifyProgress.mockRejectedValueOnce(new Error('smtp exploded'));
    const response = await post({ itemId: 'A1', checked: true, total: 35 });

    // The tick is what matters; the telling is best effort.
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalled();
    expect(mocks.reportOperationalError).toHaveBeenCalled();
  });

  it('passes the page’s total through so the email can say 3 of 35', async () => {
    await post({ itemId: 'A1', checked: true, total: 35 });
    expect(mocks.notifyProgress).toHaveBeenCalledWith(
      expect.objectContaining({ checked: 3, total: 35 }),
    );
  });

  it('ignores a nonsense total rather than emailing “3 of NaN”', async () => {
    await post({ itemId: 'A1', checked: true, total: 'lots' });
    expect(mocks.notifyProgress).toHaveBeenCalledWith(
      expect.objectContaining({ total: 3 }),
    );
  });
});
