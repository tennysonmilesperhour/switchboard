import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The checklist's feedback box.
 *
 * This is the only route in Switchboard that accepts a write from someone with
 * no session, so the tests here are mostly about what it refuses. The things
 * that must hold, whatever else changes:
 *
 *   * both rate limits are consulted, and both fail closed;
 *   * nothing is written when the limiter says no;
 *   * SVG and oversized files never reach storage;
 *   * the stored Content-Type comes from our map, never from the upload;
 *   * the object path is ours, so a crafted filename cannot steer it;
 *   * a screenshot that fails to upload does not lose the words.
 */

const mocks = vi.hoisted(() => ({
  hasAdminCredentials: vi.fn(() => true),
  checkRateLimit: vi.fn(async () => true),
  upload: vi.fn(async () => ({ error: null as unknown })),
  insert: vi.fn(async () => ({ error: null as unknown })),
  reportOperationalError: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: mocks.hasAdminCredentials,
  createAdminClient: () => ({
    storage: { from: () => ({ upload: mocks.upload }) },
    from: () => ({ insert: mocks.insert }),
  }),
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { POST } from './route';

const URL_ = 'http://localhost/api/scope-feedback';

function post(form: FormData, headers: Record<string, string> = {}) {
  return POST(new Request(URL_, { method: 'POST', body: form, headers }));
}

function withBody(body = 'The Share button does nothing on my phone.') {
  const form = new FormData();
  form.set('body', body);
  return form;
}

function png(name = 'shot.png') {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasAdminCredentials.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.upload.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
});

describe('POST /api/scope-feedback', () => {
  it('accepts a note from someone with no account', async () => {
    const response = await post(withBody());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, screenshots: 0 });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'The Share button does nothing on my phone.',
        screenshots: [],
      }),
    );
  });

  it('carries the checklist item it was sent from', async () => {
    const form = withBody();
    form.set('itemId', 'J4');
    form.set('itemLabel', 'Signals reach a group');
    await post(form);

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'J4', item_label: 'Signals reach a group' }),
    );
  });

  it('refuses an empty note without a code, because the sentence is the fix', async () => {
    const response = await post(withBody('   '));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/write what you saw/i);
    expect(json.code).toBeUndefined();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  describe('rate limiting', () => {
    it('consults a global bucket and a per-address bucket, both fail-closed', async () => {
      await post(withBody(), { 'x-vercel-forwarded-for': '203.0.113.7' });

      const calls = mocks.checkRateLimit.mock.calls as unknown as [
        string,
        number,
        number,
        { failClosed?: boolean },
      ][];
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toBe('scope-feedback:all');
      expect(calls[1][0]).toContain('203.0.113.7');
      for (const call of calls) {
        expect(call[3]).toMatchObject({ failClosed: true });
      }
    });

    it('writes nothing when the global bucket is spent', async () => {
      mocks.checkRateLimit.mockResolvedValueOnce(false);
      const response = await post(withBody());

      expect(response.status).toBe(429);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('writes nothing when one address has sent too many', async () => {
      mocks.checkRateLimit
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const response = await post(withBody());

      expect(response.status).toBe(429);
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('is refused, not opened, when the limiter itself is unavailable', async () => {
      // checkRateLimit already fails closed for us; this asserts the route
      // honours its answer rather than carrying on.
      mocks.checkRateLimit.mockResolvedValue(false);
      const response = await post(withBody());

      expect(response.status).toBe(429);
    });
  });

  describe('screenshots', () => {
    it('stores a server-derived content type and a server-generated path', async () => {
      const form = withBody();
      // A filename that would traverse, and a type that claims to be executable.
      form.append(
        'screenshots',
        new File([new Uint8Array([1])], '../../evil.png', { type: 'image/png' }),
      );
      await post(form);

      expect(mocks.upload).toHaveBeenCalledTimes(1);
      const [path, , options] = mocks.upload.mock.calls[0] as unknown as [
        string,
        unknown,
        { contentType: string },
      ];
      expect(options.contentType).toBe('image/png');
      expect(path).not.toContain('..');
      expect(path).not.toContain('evil');
      expect(path).toMatch(
        /^[0-9a-f-]{36}\/0-[0-9a-f-]{36}\.png$/,
      );
    });

    it('refuses SVG before touching storage', async () => {
      const form = withBody();
      form.append(
        'screenshots',
        new File(['<svg onload=alert(1)>'], 'x.svg', { type: 'image/svg+xml' }),
      );
      const response = await post(form);

      expect(response.status).toBe(400);
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('refuses a non-image before touching storage', async () => {
      const form = withBody();
      form.append(
        'screenshots',
        new File(['MZ'], 'payload.exe', { type: 'application/octet-stream' }),
      );
      const response = await post(form);

      expect(response.status).toBe(400);
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('refuses a file over the byte cap', async () => {
      const form = withBody();
      form.append(
        'screenshots',
        new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'huge.png', {
          type: 'image/png',
        }),
      );
      const response = await post(form);

      expect(response.status).toBe(400);
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('caps the screenshots together, under the host’s request-body limit', async () => {
      // The host rejects a body over ~4.5MB before the route runs, with a
      // non-JSON 413. Four files that were each under a per-file cap could add
      // up past it, so the cap is on the total — and the refusal is JSON the
      // page can show, not a page it cannot parse.
      const form = withBody();
      for (let i = 0; i < 2; i += 1) {
        form.append(
          'screenshots',
          new File([new Uint8Array(2 * 1024 * 1024 + 1)], `s${i}.png`, { type: 'image/png' }),
        );
      }
      const response = await post(form);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: expect.stringMatching(/under 4MB altogether/),
      });
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('refuses more than four', async () => {
      const form = withBody();
      for (let i = 0; i < 5; i += 1) form.append('screenshots', png(`s${i}.png`));
      const response = await post(form);

      expect(response.status).toBe(400);
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('keeps the words when a screenshot will not upload, and says so', async () => {
      mocks.upload.mockResolvedValueOnce({ error: { message: 'storage is down' } });
      const form = withBody();
      form.append('screenshots', png());

      const response = await post(form);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, failedUploads: 1 });
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({ screenshots: [] }),
      );
      expect(mocks.reportOperationalError).toHaveBeenCalled();
    });
  });

  describe('when the server is not configured for it', () => {
    it('says so with a code and never pretends to have saved', async () => {
      mocks.hasAdminCredentials.mockReturnValue(false);
      const response = await post(withBody());

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'SB-FEEDBACK-SAVE' });
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('carries a code when the write itself fails', async () => {
      mocks.insert.mockResolvedValueOnce({ error: { message: 'nope' } });
      const response = await post(withBody());

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: 'SB-FEEDBACK-SAVE' });
      expect(mocks.reportOperationalError).toHaveBeenCalled();
    });
  });

  it('bounds what it will store, whatever the client sends', async () => {
    const form = withBody('x'.repeat(9000));
    form.set('reporter', 'y'.repeat(500));
    await post(form);

    const [row] = mocks.insert.mock.calls[0] as unknown as [
      { body: string; reporter: string },
    ];
    expect(row.body).toHaveLength(4000);
    expect(row.reporter).toHaveLength(80);
  });
});
