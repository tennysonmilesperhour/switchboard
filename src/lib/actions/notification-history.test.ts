import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calls: Array<[string, ...unknown[]]> = [];
  const result: { data: unknown[] | null; error: { message: string } | null } = {
    data: [],
    error: null,
  };
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['from', 'select', 'eq', 'or', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    calls.push(['limit', ...args]);
    return Promise.resolve(result);
  };
  return { calls, result, builder, reportAndFail: vi.fn() };
});

vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({ ok: true, supabase: mocks.builder, user: { id: 'user-1' } }),
}));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: async (code: string) => {
    mocks.reportAndFail(code);
    return { ok: false, code, error: 'failed', fix: null };
  },
}));

import { loadOlderNotifications } from './notification-history';

const row = (n: number) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  kind: 'room_message',
  title: `Row ${n}`,
  body: null,
  url: null,
  read_at: null,
  created_at: '2026-09-29T10:00:00.123456+00:00',
});

afterEach(() => {
  mocks.calls.length = 0;
  mocks.result.data = [];
  mocks.result.error = null;
  mocks.reportAndFail.mockClear();
});

describe('loadOlderNotifications', () => {
  it('pages strictly before the last row the reader has, ties broken by id', async () => {
    mocks.result.data = Array.from({ length: 21 }, (_, i) => row(i));
    const result = await loadOlderNotifications(
      '2026-09-29T10:00:00.123456+00:00',
      '00000000-0000-0000-0000-0000000000ff',
    );
    expect(result.ok).toBe(true);
    expect(result.notifications).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(mocks.calls).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(mocks.calls).toContainEqual([
      'or',
      'created_at.lt."2026-09-29T10:00:00.123456+00:00",and(created_at.eq."2026-09-29T10:00:00.123456+00:00",id.lt.00000000-0000-0000-0000-0000000000ff)',
    ]);
  });

  it('says when there is nothing older', async () => {
    mocks.result.data = [row(1)];
    const result = await loadOlderNotifications('2026-09-29T10:00:00Z', row(2).id);
    expect(result.hasMore).toBe(false);
  });

  it('refuses a cursor that is not a timestamp and an id, without querying', async () => {
    const result = await loadOlderNotifications('2026-09-29),id.gt.(0', row(1).id);
    expect(result.ok).toBe(false);
    expect(mocks.calls).toEqual([]);
  });

  it('reports a failed read with its code', async () => {
    mocks.result.error = { message: 'boom' };
    const result = await loadOlderNotifications('2026-09-29T10:00:00Z', row(1).id);
    expect(result).toMatchObject({ ok: false, code: 'SB-NOTIFY-LOAD' });
  });
});
