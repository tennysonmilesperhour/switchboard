'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const trimmed = description.trim();
  if (!trimmed) return { ok: false, error: 'What was it for?' };

  const dollars = Number(amount);
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return { ok: false, error: 'Enter an amount greater than zero.' };
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
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rooms/${roomId}`);
  return { ok: true };
}

export async function deleteExpense(
  expenseId: string,
  roomId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('expenses').delete().eq('id', expenseId);
  revalidatePath(`/rooms/${roomId}`);
}
