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
});
