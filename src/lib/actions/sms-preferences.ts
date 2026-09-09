'use server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { revalidatePath } from 'next/cache';
import { failure, validation } from '@/lib/errors';

export async function updateSmsPreferences(enabled: boolean, plans: boolean, reminders: boolean) {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if ([enabled, plans, reminders].some(value => typeof value !== 'boolean')) return validation('Choose your SMS preferences.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_sms_preferences', { p_enabled: enabled, p_plans: plans, p_reminders: reminders });
  if (error) return failure('SB-SMS-PREFERENCES');
  revalidatePath('/settings');
  return { ok: true as const };
}
