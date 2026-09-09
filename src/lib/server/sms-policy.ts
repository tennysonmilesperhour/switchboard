import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isQuietTime } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';

/** Verification is requested separately; all other messages require current consent. */
export async function smsConsentAllows(phone: string, category: 'plans' | 'reminders', expectedUserId?: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: contact, error } = await admin.from('profile_contacts')
    .select('user_id').eq('kind', 'phone').eq('normalized_value', phone)
    .not('verified_at', 'is', null).maybeSingle();
  if (error || !contact || (expectedUserId && contact.user_id !== expectedUserId)) return false;
  const { data: prefs, error: prefsError } = await admin.from('sms_preferences')
    .select('enabled, plans, reminders, phone').eq('user_id', contact.user_id).maybeSingle();
  const { data: profile, error: profileError } = await admin.from('profiles').select('timezone, quiet_hours_start, quiet_hours_end').eq('id', contact.user_id).maybeSingle();
  if (profileError || !profile || isQuietTime(profile.quiet_hours_start ?? 22, profile.quiet_hours_end ?? 8, profile.timezone)) return false;
  return !prefsError && prefs?.phone === phone && prefs.enabled && prefs[category];
}

export async function smsBudgetAllows(phone: string): Promise<boolean> {
  // Each request is bounded to at most seven Unicode SMS segments. These are
  // attempt ceilings, deliberately including failures, rather than a dollar guarantee.
  const configured = Number(process.env.SMS_DAILY_LIMIT ?? '100');
  const limit = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 10000) : 100;
  if (!(await checkRateLimit(`sms-destination:${phone}`, 12, 86400, { failClosed: true }))) return false;
  return checkRateLimit('sms-global', limit, 86400, { failClosed: true });
}
