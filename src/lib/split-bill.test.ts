import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  isExpenseSettled,
  netFor,
  pairBalances,
  splitEvenly,
  type LedgerExpense,
  type LedgerShare,
} from './split-bill';

const ME = 'a';
const SAM = 'b';
const JO = 'c';

function share(expense: string, member: string, cents: number, settled = false): LedgerShare {
  return {
    expense_id: expense,
    member_id: member,
    share_cents: cents,
    settled_at: settled ? '2026-09-29T10:00:00Z' : null,
  };
}

describe('pairBalances', () => {
  it('says who owes whom, not just your own net', () => {
    const expenses: LedgerExpense[] = [
      { id: 'dinner', payer_id: ME, amount_cents: 3000 },
      { id: 'cab', payer_id: SAM, amount_cents: 900 },
    ];
    const shares = [
      share('dinner', ME, 1000),
      share('dinner', SAM, 1000),
      share('dinner', JO, 1000),
      share('cab', SAM, 300),
      share('cab', JO, 300),
      share('cab', ME, 300),
    ];

    const balances = pairBalances(expenses, shares);

    // Sam owed me 10 for dinner, I owed Sam 3 for the cab: Sam owes me 7.
    expect(balances).toContainEqual({ debtorId: SAM, creditorId: ME, cents: 700 });
    expect(balances).toContainEqual({ debtorId: JO, creditorId: ME, cents: 1000 });
    expect(balances).toContainEqual({ debtorId: JO, creditorId: SAM, cents: 300 });
    expect(netFor(ME, balances)).toBe(1700);
    expect(netFor(JO, balances)).toBe(-1300);
  });

  it('counts only the people who were in on an expense', () => {
    const expenses: LedgerExpense[] = [{ id: 'gas', payer_id: ME, amount_cents: 1001 }];
    const shares = [share('gas', ME, 501), share('gas', SAM, 500)];

    expect(pairBalances(expenses, shares)).toEqual([
      { debtorId: SAM, creditorId: ME, cents: 500 },
    ]);
  });

  it('leaves settled shares out, and an all-settled expense reads as settled', () => {
    const expense: LedgerExpense = { id: 'gas', payer_id: ME, amount_cents: 1000 };
    const shares = [share('gas', ME, 500), share('gas', SAM, 500, true)];

    expect(pairBalances([expense], shares)).toEqual([]);
    expect(isExpenseSettled(expense, shares)).toBe(true);
    expect(isExpenseSettled(expense, [share('gas', ME, 500), share('gas', SAM, 500)])).toBe(false);
  });

  it('nets a pair to nothing when they are even', () => {
    const expenses: LedgerExpense[] = [
      { id: 'x', payer_id: ME, amount_cents: 1000 },
      { id: 'y', payer_id: SAM, amount_cents: 1000 },
    ];
    const shares = [share('x', SAM, 500), share('x', ME, 500), share('y', ME, 500), share('y', SAM, 500)];

    expect(pairBalances(expenses, shares)).toEqual([]);
  });
});

describe('splitEvenly', () => {
  it('matches the database: odd cents to the first people in id order', () => {
    const shares = splitEvenly(1001, [SAM, ME]);

    expect(shares.get(ME)).toBe(501);
    expect(shares.get(SAM)).toBe(500);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1001);
  });

  it('splits nothing when nobody is in on it', () => {
    expect(splitEvenly(1000, []).size).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats cents as US dollars', () => {
    expect(formatMoney(4250)).toBe('$42.50');
  });
});
