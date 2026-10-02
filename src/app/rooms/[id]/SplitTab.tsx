'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { deleteExpense, saveExpense, settleUp } from '@/lib/actions/expenses';
import { errorRef, type ActionResult } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { safeHttpUrl } from '@/lib/security';
import {
  formatMoney,
  isExpenseSettled,
  netFor,
  pairBalances,
  splitEvenly,
  type LedgerShare,
} from '@/lib/split-bill';
import type { RoomMemberInfo } from './RoomHeader';

export interface ExpenseRow {
  id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  settle_url: string | null;
  created_by: string;
  created_at: string;
}

export type ExpenseShareRow = LedgerShare;

interface SplitTabProps {
  roomId: string;
  currentUserId: string;
  members: RoomMemberInfo[];
  /** Names for everyone who ever appears in the ledger, including people who left. */
  names: Record<string, string>;
  expenses: ExpenseRow[];
  shares: ExpenseShareRow[];
  readOnly: boolean;
}

function first(name: string): string {
  return name.split(' ')[0] || name;
}

/**
 * Split the Bill (G31, D21): who paid, who was in on it, who owes whom, and a
 * settled state. USD only for now.
 */
export function SplitTab({
  roomId,
  currentUserId,
  members,
  names,
  expenses,
  shares,
  readOnly,
}: SplitTabProps) {
  const memberIds = useMemo(() => members.map((member) => member.id), [members]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [settleUrl, setSettleUrl] = useState('');
  const [payerId, setPayerId] = useState(currentUserId);
  const [participants, setParticipants] = useState<string[]>(memberIds);
  const [formError, setFormError] = useState<Pick<ActionResult, 'error' | 'code'> | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const nameOf = (id: string) =>
    id === currentUserId ? 'You' : (names[id] ?? 'Someone who left');

  const balances = useMemo(() => pairBalances(expenses, shares), [expenses, shares]);
  const myNet = netFor(currentUserId, balances);
  const mine = balances.filter(
    (balance) => balance.debtorId === currentUserId || balance.creditorId === currentUserId,
  );
  const theirs = balances.filter(
    (balance) => balance.debtorId !== currentUserId && balance.creditorId !== currentUserId,
  );
  const totalCents = expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);

  const cents = Math.round(Number(amount) * 100);
  const preview =
    Number.isFinite(cents) && cents > 0 ? splitEvenly(cents, participants) : new Map<string, number>();
  const perPerson = preview.size ? Math.max(...preview.values()) : 0;

  function resetForm() {
    setEditingId(null);
    setDescription('');
    setAmount('');
    setSettleUrl('');
    setPayerId(currentUserId);
    setParticipants(memberIds);
    setFormError(null);
  }

  function startEdit(expense: ExpenseRow) {
    setEditingId(expense.id);
    setDescription(expense.description);
    setAmount((expense.amount_cents / 100).toFixed(2));
    setSettleUrl(expense.settle_url ?? '');
    setPayerId(expense.payer_id);
    const inOn = shares
      .filter((share) => share.expense_id === expense.id)
      .map((share) => share.member_id)
      .filter((id) => memberIds.includes(id));
    setParticipants(inOn.length ? inOn : memberIds);
    setFormError(null);
  }

  function toggleParticipant(id: string) {
    setParticipants((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim() || !amount.trim()) return;
    setFormError(null);
    startTransition(async () => {
      const result = await saveExpense({
        roomId,
        expenseId: editingId,
        description,
        amount,
        payerId,
        participantIds: participants,
        settleUrl,
      });
      if (!result.ok) {
        setFormError({ error: result.error ?? 'Could not save that.', code: result.code });
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  async function remove(expense: ExpenseRow) {
    const ok = await confirm({
      title: 'Delete this expense?',
      body: 'It’ll be removed from the ledger for everyone in this room.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteExpense(expense.id, roomId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete the expense. Try again.', result.code);
        return;
      }
      if (editingId === expense.id) resetForm();
      router.refresh();
    });
  }

  async function settleWith(otherId: string, cents: number) {
    const name = nameOf(otherId);
    const ok = await confirm({
      title: `Settle up with ${first(name)}?`,
      body: `Marks everything between you and ${first(name)} in this room as paid back (${formatMoney(cents)} net). Everyone in the room sees it settled.`,
      confirmLabel: 'Mark settled',
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await settleUp(roomId, otherId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not record that. Try again.', result.code);
        return;
      }
      toast.success(`You and ${first(name)} are square.`);
      router.refresh();
    });
  }

  return (
    <div className="flex-1 overflow-y-auto py-3 space-y-3">
      {expenses.length > 0 && (
        <div className="rounded-card bg-cream px-3.5 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-soft">Total spent</span>
            <span className="font-medium">{formatMoney(totalCents)}</span>
          </div>
          <p className="text-sm mt-2 pt-2 border-t border-line">
            {myNet > 0 ? (
              <>You’re owed <strong>{formatMoney(myNet)}</strong> in all.</>
            ) : myNet < 0 ? (
              <>You owe <strong>{formatMoney(-myNet)}</strong> in all.</>
            ) : (
              <>You’re all square.</>
            )}
          </p>
          {mine.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {mine.map((balance) => {
                const other =
                  balance.debtorId === currentUserId ? balance.creditorId : balance.debtorId;
                return (
                  <li
                    key={`${balance.debtorId}-${balance.creditorId}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0">
                      {balance.debtorId === currentUserId
                        ? <>You owe {first(nameOf(other))} <strong>{formatMoney(balance.cents)}</strong></>
                        : <>{first(nameOf(other))} owes you <strong>{formatMoney(balance.cents)}</strong></>}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => settleWith(other, balance.cents)}
                        className="min-h-11 shrink-0 rounded-pill px-2 text-xs font-semibold text-terracotta-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        Mark settled
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {theirs.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-faint">
              {theirs.map((balance) => (
                <li key={`${balance.debtorId}-${balance.creditorId}`}>
                  {first(nameOf(balance.debtorId))} owes {first(nameOf(balance.creditorId))}{' '}
                  {formatMoney(balance.cents)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState
          emoji="💸"
          title="No expenses yet"
          body="Log what someone paid and who was in on it - Switchboard works out who owes whom. Settling up happens with your own Venmo or PayPal link."
        />
      ) : (
        <ul className="space-y-2">
          {expenses.map((expense) => {
            const canChange =
              !readOnly &&
              (expense.created_by === currentUserId || expense.payer_id === currentUserId);
            const split = shares.filter((share) => share.expense_id === expense.id);
            const settled = isExpenseSettled(expense, split);
            const settleHref = safeHttpUrl(expense.settle_url);
            return (
              <li
                key={expense.id}
                className="flex items-start gap-3 rounded-card bg-card border border-line px-3.5 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words">
                    {expense.description}
                    {settled && (
                      <span className="ml-2 rounded-pill bg-sage-soft px-2 py-0.5 text-[11px] font-semibold text-sage-deep">
                        Settled
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {nameOf(expense.payer_id)} paid ·{' '}
                    {split.length > 0
                      ? `split ${split.length} ${split.length === 1 ? 'way' : 'ways'} (${split
                          .map((share) => first(nameOf(share.member_id)))
                          .join(', ')})`
                      : 'not split yet'}{' '}
                    · {formatRelative(expense.created_at)}
                  </p>
                  {settleHref && (
                    <a
                      href={settleHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-terracotta-deep underline underline-offset-2 mt-1 inline-block"
                    >
                      Settle up →
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-medium">{formatMoney(expense.amount_cents)}</span>
                  {canChange && (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(expense)}
                        disabled={pending}
                        className="min-h-11 rounded-pill px-2 text-[11px] text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(expense)}
                        disabled={pending}
                        className="min-h-11 rounded-pill px-2 text-[11px] text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        remove
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && (
        <form onSubmit={submit} className="space-y-2 pt-2 border-t border-line">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {editingId ? 'Edit expense' : 'Add an expense'}
          </p>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was it for?"
            aria-label="Expense description"
            maxLength={120}
            className="w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          <div className="flex gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Amount ($)"
              aria-label="Amount in US dollars"
              className="w-32 rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-card border border-line bg-card px-3 text-sm">
              <span className="shrink-0 text-ink-faint">Paid by</span>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                aria-label="Who paid"
                className="min-w-0 flex-1 bg-transparent py-2.5 outline-none"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === currentUserId ? 'You' : member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs text-ink-faint">Split between</legend>
            <div className="flex flex-wrap gap-1.5">
              {members.map((member) => (
                <Chip
                  key={member.id}
                  selected={participants.includes(member.id)}
                  disabled={pending}
                  onClick={() => toggleParticipant(member.id)}
                >
                  {member.id === currentUserId ? 'You' : first(member.name)}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">
              {participants.length === 0
                ? 'Pick at least one person.'
                : perPerson > 0
                  ? `About ${formatMoney(perPerson)} each for ${participants.length} ${participants.length === 1 ? 'person' : 'people'}.`
                  : `Split evenly between ${participants.length} ${participants.length === 1 ? 'person' : 'people'}.`}
            </p>
          </fieldset>
          <input
            value={settleUrl}
            onChange={(e) => setSettleUrl(e.target.value)}
            placeholder="Venmo/PayPal link (optional)"
            aria-label="Settle-up link"
            className="w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          {formError && (
            <p className="text-xs text-rose-deep">
              {formError.error}
              {formError.code && (
                <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide opacity-70">
                  {errorRef(formError.code)}
                </span>
              )}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={
                pending || !description.trim() || !amount.trim() || participants.length === 0
              }
            >
              {editingId ? 'Save changes' : 'Add expense'}
            </Button>
            {editingId && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
