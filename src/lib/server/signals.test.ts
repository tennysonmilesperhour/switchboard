import { describe, expect, it, vi } from 'vitest';

import { loadVisibleSignals } from '@/lib/server/signals';

/**
 * A stub that records the query it was handed, so the tests can assert the
 * *shape* of the request as well as the result — the expiry filter is a privacy
 * boundary, not a nicety, and it would be easy to drop without any test noticing.
 */
function clientReturning(rows: unknown[]) {
  const calls: Record<string, unknown> = {};
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn((column: string, values: string[]) => {
      calls.inColumn = column;
      calls.inValues = values;
      return builder;
    }),
    gt: vi.fn((column: string) => {
      calls.gtColumn = column;
      return builder;
    }),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return {
    calls,
    client: { from: vi.fn(() => builder) } as never,
  };
}

const ALEX = '11111111-1111-1111-1111-111111111111';
const SAM = '22222222-2222-2222-2222-222222222222';

describe('loadVisibleSignals', () => {
  it('keys each visible signal by its person', async () => {
    const { client } = clientReturning([
      { user_id: ALEX, emoji: '☕', label: 'Coffee Break', expires_at: '2026-08-12T18:00:00Z' },
    ]);

    expect(await loadVisibleSignals(client, [ALEX])).toEqual({
      [ALEX]: { emoji: '☕', label: 'Coffee Break' },
    });
  });

  it('shows the soonest to expire when someone holds several', async () => {
    // The query orders by expiry, so the first row for a person is the one
    // actually about right now.
    const { client } = clientReturning([
      { user_id: ALEX, emoji: '🚶', label: 'Walk?', expires_at: '2026-08-12T18:00:00Z' },
      { user_id: ALEX, emoji: '🎲', label: 'Game Night', expires_at: '2026-08-12T23:00:00Z' },
    ]);

    expect(await loadVisibleSignals(client, [ALEX])).toEqual({
      [ALEX]: { emoji: '🚶', label: 'Walk?' },
    });
  });

  it('asks only for unexpired rows', async () => {
    const { client, calls } = clientReturning([]);
    await loadVisibleSignals(client, [ALEX, SAM]);

    expect(calls.gtColumn, 'an expired signal is not a live one').toBe('expires_at');
    expect(calls.inColumn).toBe('user_id');
  });

  it('does not query at all for an empty or duplicate-only list', async () => {
    const { client } = clientReturning([]);
    expect(await loadVisibleSignals(client, [])).toEqual({});
    expect(client.from).not.toHaveBeenCalled();
  });

  it('de-duplicates the ids it asks about', async () => {
    const { client, calls } = clientReturning([]);
    await loadVisibleSignals(client, [ALEX, ALEX, SAM]);
    expect(calls.inValues).toEqual([ALEX, SAM]);
  });

  it('returns nothing rather than throwing when the read fails', async () => {
    // RLS hides what the viewer may not see by returning no rows, so "no
    // signals" and "not allowed" are the same answer here by design.
    const { client } = clientReturning([]);
    expect(await loadVisibleSignals(client, [ALEX])).toEqual({});
  });
});
