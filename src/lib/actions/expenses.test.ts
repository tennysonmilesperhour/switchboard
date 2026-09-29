import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  deleteSelect: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed' })),
}));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({
    ok: true,
    user: { id: 'me' },
    supabase: {
      from: () => ({
        insert: mocks.insert,
        delete: () => ({ eq: () => ({ select: mocks.deleteSelect }) }),
      }),
    },
  }),
}));

import { addExpense, deleteExpense } from './expenses';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.deleteSelect.mockResolvedValue({ data: [{ id: 'e1' }], error: null });
});

describe('addExpense', () => {
  it('stores a settle-up link only as a normalised web address', async () => {
    const result = await addExpense('room-1', 'Pizza', '42.50', 'venmo.com/u/sam');

    expect(result).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ amount_cents: 4250, settle_url: 'https://venmo.com/u/sam' }),
    );
  });

  it('refuses a link every member would be handed that is not http(s)', async () => {
    const result = await addExpense('room-1', 'Pizza', '10', 'javascript:alert(1)');

    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('refuses an amount the integer column cannot hold, as validation', async () => {
    const result = await addExpense('room-1', 'Car', '50000000', '');

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('code');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('deleteExpense', () => {
  it('does not report success when RLS deleted nothing', async () => {
    mocks.deleteSelect.mockResolvedValue({ data: [], error: null });

    const result = await deleteExpense('e1', 'room-1');

    expect(result.ok).toBe(false);
  });
});
