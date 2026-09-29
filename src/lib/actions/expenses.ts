'use server';

import { validation, type ActionResult } from '@/lib/errors';
import { safeHttpUrl } from '@/lib/security';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

/**
 * Split the Bill — a shared ledger inside a Living Room. Switchboard only
 * tracks who paid what; settling up happens off-platform via a linked
 * Venmo/PayPal URL. RLS restricts everything to room members.
 */
export async function addExpense(
  roomId: string,
  description: string,
  amount: string,
  settleUrl: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const trimmed = description.trim().slice(0, 120);
  if (!trimmed) return validation('What was it for?');

  const dollars = Number(amount);
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return validation('Enter an amount greater than zero.');
  }
  const amountCents = Math.round(dollars * 100);
  // amount_cents is a Postgres int; anything larger failed as "didn't save".
  if (amountCents > 100_000_000) {
    return validation('That’s more than this ledger can hold. Enter an amount under $1,000,000.');
  }

  // Rendered as a link for everyone in the room, so only an http(s) address is
  // stored — never a `javascript:` or other scheme typed into the box.
  const url = settleUrl.trim();
  const settle = url ? safeHttpUrl(url) : null;
  if (url && !settle) {
    return validation('That settle-up link isn’t a web address. Paste your Venmo or PayPal link.');
  }

  const { error } = await supabase.from('expenses').insert({
    room_id: roomId,
    description: trimmed,
    amount_cents: amountCents,
    payer_id: user.id,
    settle_url: settle,
    created_by: user.id,
  });
  if (error) return reportAndFail('SB-EXPENSE-SAVE', 'expense.save', error, { roomId });

  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
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
