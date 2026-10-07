import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  deleteSelect: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed' })),
}));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({
    ok: true,
    user: { id: '00000000-0000-0000-0000-000000000001' },
    supabase: {
      rpc: mocks.rpc,
      from: () => ({
        delete: () => ({ eq: () => ({ select: mocks.deleteSelect }) }),
      }),
    },
  }),
}));

import { deleteExpense, saveExpense, settleUp } from './expenses';

const ME = '00000000-0000-0000-0000-000000000001';
const SAM = '00000000-0000-0000-0000-000000000002';
const ROOM = '00000000-0000-0000-0000-0000000000aa';

function input(overrides: Partial<Parameters<typeof saveExpense>[0]> = {}) {
  return {
    roomId: ROOM,
    description: 'Pizza',
    amount: '42.50',
    payerId: ME,
    participantIds: [ME, SAM],
    settleUrl: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: 'e1', error: null });
  mocks.deleteSelect.mockResolvedValue({ data: [{ id: 'e1' }], error: null });
});

describe('saveExpense', () => {
  it('sends the payer, the participants and cents to save_expense', async () => {
    const result = await saveExpense(input({ payerId: SAM, settleUrl: 'venmo.com/u/sam' }));

    expect(result).toEqual({ ok: true, expenseId: 'e1' });
    expect(mocks.rpc).toHaveBeenCalledWith('save_expense', {
      p_room: ROOM,
      p_description: 'Pizza',
      p_amount_cents: 4250,
      p_payer: SAM,
      p_participants: [ME, SAM],
      p_expense: undefined,
      p_settle_url: 'https://venmo.com/u/sam',
    });
  });

  it('refuses a link every member would be handed that is not http(s)', async () => {
    const result = await saveExpense(input({ settleUrl: 'javascript:alert(1)' }));

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses an amount the integer column cannot hold, as validation', async () => {
    const result = await saveExpense(input({ amount: '50000000' }));

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('code');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(['1e2', '0x10', '1.005', '12,50.5.5', 'abc', '-5'])(
    'refuses %s rather than saving a different amount than was typed',
    async (amount) => {
      const result = await saveExpense(input({ amount }));

      expect(result.ok).toBe(false);
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['42.5', 4250],
    ['$1,200.00', 120000],
    ['7', 700],
  ])('reads %s as %i cents', async (amount, cents) => {
    await saveExpense(input({ amount }));

    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_expense',
      expect.objectContaining({ p_amount_cents: cents }),
    );
  });

  it('needs at least one person to split with', async () => {
    const result = await saveExpense(input({ participantIds: [] }));

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('tells the reader a closed room is read-only rather than "try again"', async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'save_expense'
        ? { data: null, error: { code: '42501', message: 'this room is read-only' } }
        : { data: true, error: null },
    );

    const result = await saveExpense(input());

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('code');
    expect(result.error).toMatch(/read-only/);
  });

  it('reports an unexpected database failure with its code', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });

    const result = await saveExpense(input());

    expect(result).toMatchObject({ ok: false, code: 'SB-EXPENSE-SAVE' });
  });
});

describe('settleUp', () => {
  it('settles with one other person through settle_up', async () => {
    const result = await settleUp(ROOM, SAM);

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('settle_up', { p_room: ROOM, p_other: SAM });
  });

  it('cannot settle with yourself', async () => {
    const result = await settleUp(ROOM, ME);

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('deleteExpense', () => {
  it('does not report success when RLS deleted nothing', async () => {
    mocks.deleteSelect.mockResolvedValue({ data: [], error: null });

    const result = await deleteExpense('e1', ROOM);

    expect(result.ok).toBe(false);
  });
});
