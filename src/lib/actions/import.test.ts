import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  safeFetchText: vi.fn(),
}));

vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({ ok: true, user: { id: 'user-1' }, supabase: {} }),
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: async () => true }));
vi.mock('@/lib/net-guard', () => ({
  isFetchableUrl: (raw: string) => ({ ok: true, url: new URL(raw) }),
}));
vi.mock('@/lib/server/safe-fetch', () => ({ safeFetchText: mocks.safeFetchText }));

import { importEventFromLink } from './import';

function eventPage(startDate: string) {
  return {
    ok: true,
    contentType: 'text/html',
    body: `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Event","name":"Rooftop Dinner",
       "startDate":"${startDate}","location":{"@type":"Place","name":"Ana's Roof"}}
    </script></head></html>`,
  };
}

beforeEach(() => mocks.safeFetchText.mockReset());

describe('importEventFromLink', () => {
  it('shows an offset start in the host’s own zone, not the server’s', async () => {
    mocks.safeFetchText.mockResolvedValue(eventPage('2026-10-03T19:00:00-07:00'));
    const result = await importEventFromLink('https://lu.ma/e/1', 'America/Los_Angeles');
    expect(result).toMatchObject({ ok: true, date: '2026-10-03', time: '19:00' });
  });

  it('takes a start with no offset as the wall-clock time it names', async () => {
    mocks.safeFetchText.mockResolvedValue(eventPage('2026-10-03T19:00:00'));
    const result = await importEventFromLink('https://lu.ma/e/1', 'Asia/Tokyo');
    expect(result).toMatchObject({ ok: true, date: '2026-10-03', time: '19:00' });
  });

  it('falls back to the runtime zone for a zone the browser could not name', async () => {
    mocks.safeFetchText.mockResolvedValue(eventPage('2026-10-03T19:00:00Z'));
    const result = await importEventFromLink('https://lu.ma/e/1', 'Not/AZone');
    expect(result.ok).toBe(true);
    expect(result.date).toMatch(/^2026-10-0[34]$/);
  });
});
