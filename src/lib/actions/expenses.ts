'use server';

import { validation, type ActionResult } from '@/lib/errors';
import { safeHttpUrl } from '@/lib/security';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const READ_ONLY_MESSAGE =
  'This conversation is read-only now, so its ledger can’t change. You can still read it.';

export interface ExpenseInput {
  roomId: string;
  /** Set when editing an existing expense; absent for a new one. */
  expenseId?: string | null;
  description: string;
  /** Dollars as typed, e.g. "42.50". USD only for now (D21). */
  amount: string;
  /** Who paid — any member of the room (D21). */
  payerId: string;
  /** Who is in on it — a subset of the room's members, at least one. */
  participantIds: string[];
  settleUrl: string;
}

/**
 * Split the Bill — a shared ledger inside a Living Room. Switchboard tracks who
 * paid what and who was in on it; settling up happens off-platform via a linked
 * Venmo/PayPal URL, and is then recorded with `settleUp`.
 *
 * Adding and editing both go through `save_expense`, which is where the rules
 * live: the payer and everyone splitting must be in the room, only the person
 * who logged an expense or who paid it may change it, and the shares always add
 * up to the amount. The checks below exist to give a useful sentence first.
 */
export async function saveExpense(
  input: ExpenseInput,
): Promise<ActionResult & { expenseId?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { roomId } = input;

  const trimmed = input.description.trim().slice(0, 120);
  if (!trimmed) return validation('What was it for?');

  const dollars = Number(input.amount);
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return validation('Enter an amount greater than zero.');
  }
  const amountCents = Math.round(dollars * 100);
  if (amountCents < 1) return validation('Enter an amount greater than zero.');
  // amount_cents is a Postgres int; anything larger failed as "didn't save".
  if (amountCents > 100_000_000) {
    return validation('That’s more than this ledger can hold. Enter an amount under $1,000,000.');
  }

  if (!UUID_RE.test(input.payerId)) return validation('Choose who paid.');
  const participants = [...new Set(input.participantIds)].filter((id) => UUID_RE.test(id));
  if (participants.length === 0) return validation('Choose at least one person to split it with.');
  if (input.expenseId && !UUID_RE.test(input.expenseId)) {
    return validation('That expense is no longer here.');
  }

  // Rendered as a link for everyone in the room, so only an http(s) address is
  // stored — never a `javascript:` or other scheme typed into the box.
  const url = input.settleUrl.trim();
  const settle = url ? safeHttpUrl(url) : null;
  if (url && !settle) {
    return validation('That settle-up link isn’t a web address. Paste your Venmo or PayPal link.');
  }

  const { data: expenseId, error } = await supabase.rpc('save_expense', {
    p_room: roomId,
    p_description: trimmed,
    p_amount_cents: amountCents,
    p_payer: input.payerId,
    p_participants: participants,
    p_expense: input.expenseId ?? undefined,
    p_settle_url: settle ?? undefined,
  });
  if (error) {
    if (error.code === '42501') {
      const { data: readOnly } = await supabase.rpc('room_is_read_only', { p_room: roomId });
      if (readOnly === true) return validation(READ_ONLY_MESSAGE);
      return validation(
        'Everyone on an expense has to be in this room, and only the person who logged it or who paid can change it. Reload to see who’s here.',
      );
    }
    return reportAndFail('SB-EXPENSE-SAVE', 'expense.save', error, { roomId });
  }

  revalidatePath(`/rooms/${roomId}`);
  // The id lets the form wait until the refreshed ledger shows the row.
  return { ok: true, expenseId: expenseId ?? undefined };
}

export async function deleteExpense(
  expenseId: string,
  roomId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data, error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .select('id');
  if (error) return reportAndFail('SB-EXPENSE-SAVE', 'expense.save', error, { roomId });
  // RLS lets only the logger or the payer delete; a refused delete is zero
  // rows, not an error, and used to report success while the row stayed.
  if (!data || data.length === 0) {
    return validation('That expense was already removed, or isn’t yours to remove.');
  }
  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
}

/**
 * Record that you and one other person are square: every share still owed
 * between the two of you in this room, in either direction, is marked paid
 * back. Nobody else's balance moves.
 */
export async function settleUp(roomId: string, otherId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(otherId) || otherId === user.id) {
    return validation('Choose who you’re settling up with.');
  }

  const { error } = await supabase.rpc('settle_up', { p_room: roomId, p_other: otherId });
  if (error) {
    if (error.code === '42501') {
      const { data: readOnly } = await supabase.rpc('room_is_read_only', { p_room: roomId });
      if (readOnly === true) return validation(READ_ONLY_MESSAGE);
    }
    return reportAndFail('SB-EXPENSE-SAVE', 'expense.settle', error, { roomId });
  }
  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
}
