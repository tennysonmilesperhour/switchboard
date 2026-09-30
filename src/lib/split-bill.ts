/**
 * Split the Bill arithmetic, pure so it is testable without a database.
 *
 * Every expense carries its shares (`expense_shares`): who was in on it and for
 * how many cents, written by `save_expense` so they always add up to the
 * amount. A share the payer holds themselves is owed to nobody. A settled share
 * is paid back and counts for nothing. What is left is a set of debts
 * "member owes payer", which are netted per pair so the room reads
 * "Sam owes you $12" rather than "you owe Sam $3 and Sam owes you $15".
 */

export interface LedgerExpense {
  id: string;
  payer_id: string;
  amount_cents: number;
}

export interface LedgerShare {
  expense_id: string;
  member_id: string;
  share_cents: number;
  settled_at: string | null;
}

/** One netted debt between two people. */
export interface PairBalance {
  debtorId: string;
  creditorId: string;
  cents: number;
}

const SEP = '\u0000';

/** Net unsettled debts between each pair of people, largest first. */
export function pairBalances(
  expenses: LedgerExpense[],
  shares: LedgerShare[],
): PairBalance[] {
  const payerOf = new Map(expenses.map((expense) => [expense.id, expense.payer_id]));
  const owed = new Map<string, number>();
  for (const share of shares) {
    if (share.settled_at || share.share_cents <= 0) continue;
    const payer = payerOf.get(share.expense_id);
    if (!payer || payer === share.member_id) continue;
    const key = `${share.member_id}${SEP}${payer}`;
    owed.set(key, (owed.get(key) ?? 0) + share.share_cents);
  }

  const seen = new Set<string>();
  const balances: PairBalance[] = [];
  for (const [key, cents] of owed) {
    const [debtor, creditor] = key.split(SEP);
    const pair = [debtor, creditor].sort().join(SEP);
    if (seen.has(pair)) continue;
    seen.add(pair);
    const net = cents - (owed.get(`${creditor}${SEP}${debtor}`) ?? 0);
    if (net > 0) balances.push({ debtorId: debtor, creditorId: creditor, cents: net });
    else if (net < 0) balances.push({ debtorId: creditor, creditorId: debtor, cents: -net });
  }
  return balances.sort(
    (a, b) => b.cents - a.cents || a.debtorId.localeCompare(b.debtorId),
  );
}

/** Where the viewer stands: positive when they are owed, negative when they owe. */
export function netFor(userId: string, balances: PairBalance[]): number {
  return balances.reduce((sum, balance) => {
    if (balance.creditorId === userId) return sum + balance.cents;
    if (balance.debtorId === userId) return sum - balance.cents;
    return sum;
  }, 0);
}

/**
 * The even split `save_expense` will write, for previewing a form: odd cents go
 * to the first people in id order, exactly as the database assigns them.
 */
export function splitEvenly(amountCents: number, memberIds: string[]): Map<string, number> {
  const members = [...new Set(memberIds)].sort();
  const shares = new Map<string, number>();
  if (members.length === 0 || amountCents <= 0) return shares;
  const base = Math.floor(amountCents / members.length);
  const remainder = amountCents % members.length;
  members.forEach((id, index) => shares.set(id, base + (index < remainder ? 1 : 0)));
  return shares;
}

/** True when every share of an expense that was owed to someone is settled. */
export function isExpenseSettled(expense: LedgerExpense, shares: LedgerShare[]): boolean {
  const owedShares = shares.filter(
    (share) =>
      share.expense_id === expense.id &&
      share.member_id !== expense.payer_id &&
      share.share_cents > 0,
  );
  return owedShares.length > 0 && owedShares.every((share) => share.settled_at !== null);
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}
