'use server';

import { validation, type ActionResult } from '@/lib/errors';

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

  const trimmed = description.trim();
  if (!trimmed) return validation('What was it for?');

  const dollars = Number(amount);
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return validation('Enter an amount greater than zero.');
  }
  const amountCents = Math.round(dollars * 100);

  const url = settleUrl.trim();

  const { error } = await supabase.from('expenses').insert({
    room_id: roomId,
    description: trimmed,
    amount_cents: amountCents,
    payer_id: user.id,
    settle_url: url || null,
    created_by: user.id,
  });
  if (error) return reportAndFail('SB-EXPENSE-SAVE', 'expense.save', error, { roomId });

  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
}

export async function deleteExpense(
  expenseId: string,
  roomId: string,
): Promise<void> {
  const auth = await requireUser();
  if (!auth.ok) return;
  const { supabase } = auth;
  await supabase.from('expenses').delete().eq('id', expenseId);
  revalidatePath(`/rooms/${roomId}`);
}
