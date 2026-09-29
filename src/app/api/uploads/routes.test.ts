import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  hasAdminCredentials: vi.fn(() => true),
  createAdminClient: vi.fn(),
  checkRateLimit: vi.fn(async () => true),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.user }, error: null }),
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: mocks.hasAdminCredentials,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: vi.fn(),
}));

import { POST as uploadAudio } from './audio/route';
import { POST as uploadImage } from './image/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.hasAdminCredentials.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue(true);
});

afterEach(() => {
  mocks.user = null;
});

describe('upload route handlers', () => {
  it.each([
    ['image', uploadImage],
    ['audio', uploadAudio],
  ])('requires a session before accepting an %s upload', async (_kind, handler) => {
    const response = await handler(new Request('http://localhost/api/uploads'));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/sign in/i) });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects executable SVG before touching storage', async () => {
    mocks.user = { id: 'user-1' };
    const form = new FormData();
    form.set(
      'file',
      new File(['<svg><script /></svg>'], 'attack.svg', {
        type: 'image/svg+xml',
      }),
    );

    const response = await uploadImage(
      new Request('http://localhost/api/uploads/image', {
        method: 'POST',
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'SVG images are not supported.' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a non-audio file before touching storage', async () => {
    mocks.user = { id: 'user-1' };
    const form = new FormData();
    form.set(
      'file',
      new File(['pixels'], 'photo.png', { type: 'image/png' }),
    );

    const response = await uploadAudio(
      new Request('http://localhost/api/uploads/audio', {
        method: 'POST',
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'That does not look like an audio clip.',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  describe('operational failures carry their registry code', () => {
    function audioForm() {
      const form = new FormData();
      form.set('file', new File(['clip'], 'voice-note.webm', { type: 'audio/webm' }));
      return form;
    }

    function imageForm() {
      const form = new FormData();
      form.set('file', new File(['pixels'], 'photo.png', { type: 'image/png' }));
      return form;
    }

    function storageReturning(error: { message: string } | null) {
      mocks.createAdminClient.mockReturnValue({
        storage: {
          createBucket: vi.fn(async () => ({ error: null })),
          from: () => ({ upload: vi.fn(async () => ({ error })) }),
        },
      });
    }

    const cases = [
      ['image', uploadImage, imageForm],
      ['audio', uploadAudio, audioForm],
    ] as const;

    it.each(cases)('%s: storage not configured is SB-CONFIG-STORAGE', async (_kind, handler, form) => {
      mocks.user = { id: 'user-1' };
      mocks.hasAdminCredentials.mockReturnValue(false);

      const response = await handler(
        new Request('http://localhost/api/uploads', { method: 'POST', body: form() }),
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'SB-CONFIG-STORAGE' });
    });

    it.each(cases)('%s: the upload limit is SB-RATE-LIMIT', async (_kind, handler, form) => {
      mocks.user = { id: 'user-1' };
      mocks.checkRateLimit.mockResolvedValue(false);

      const response = await handler(
        new Request('http://localhost/api/uploads', { method: 'POST', body: form() }),
      );

      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ code: 'SB-RATE-LIMIT' });
    });

    it.each(cases)('%s: a failed storage write is SB-UPLOAD-FAILED', async (_kind, handler, form) => {
      mocks.user = { id: 'user-1' };
      storageReturning({ message: 'bucket unavailable' });

      const response = await handler(
        new Request('http://localhost/api/uploads', { method: 'POST', body: form() }),
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        error: expect.any(String),
        code: 'SB-UPLOAD-FAILED',
      });
    });
  });

  it('stores voice notes under an allowlisted type, not the client-declared one', async () => {
    mocks.user = { id: 'user-1' };
    const upload = vi.fn(async () => ({ error: null }));
    mocks.createAdminClient.mockReturnValue({
      storage: {
        createBucket: vi.fn(async () => ({ error: null })),
        from: () => ({ upload }),
      },
    });
    const form = new FormData();
    // Starts with audio/ so it passes the gate, but the declared type is
    // attacker-chosen; what gets stored must come from our own map.
    form.set(
      'file',
      new File(['clip'], 'voice-note.webm', { type: 'audio/webm;<script>' }),
    );

    const response = await uploadAudio(
      new Request('http://localhost/api/uploads/audio', { method: 'POST', body: form }),
    );

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/\.webm$/),
      expect.anything(),
      expect.objectContaining({ contentType: 'audio/webm' }),
    );
  });
});
