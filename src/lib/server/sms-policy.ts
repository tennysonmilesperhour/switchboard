import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isQuietTime } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';

/** Verification is requested separately; all other messages require current consent. */
export async function smsConsentAllows(phone: string, category: 'plans' | 'reminders', expectedUserId?: string, guestInviteId?: string, urgentUntil?: string): Promise<boolean> {
  const admin = createAdminClient();
  if (guestInviteId && !expectedUserId) {
    const { data: allowed, error } = await admin.rpc('guest_sms_allowed', { p_invite: guestInviteId, p_phone: phone });
    if (error || !allowed) return false;
    const { data: invite } = await admin.from('invites').select('event_id').eq('id', guestInviteId).maybeSingle();
    if (!invite) return false;
    const { data: event } = await admin.from('events').select('time_zone').eq('id', invite.event_id).maybeSingle();
    return Boolean(event) && !isQuietTime(22, 8, event?.time_zone ?? 'UTC');
  }
  const { data: contact, error } = await admin.from('profile_contacts')
    .select('user_id').eq('kind', 'phone').eq('normalized_value', phone)
    .not('verified_at', 'is', null).maybeSingle();
  if (error || !contact || (expectedUserId && contact.user_id !== expectedUserId)) return false;
  const { data: prefs, error: prefsError } = await admin.from('sms_preferences')
    .select('enabled, plans, reminders, phone, urgent_changes').eq('user_id', contact.user_id).maybeSingle();
  const { data: profile, error: profileError } = await admin.from('profiles').select('timezone, quiet_hours_start, quiet_hours_end').eq('id', contact.user_id).maybeSingle();
  const { data: route, error: routeError } = await admin.from('notification_routes').select('plans, reminders').eq('user_id', contact.user_id).maybeSingle();
  if (routeError || (route && !['existing', 'sms'].includes(route[category]))) return false;
  const urgent = prefs?.urgent_changes && urgentUntil && Date.parse(urgentUntil) > Date.now();
  if (profileError || !profile || (!urgent && isQuietTime(profile.quiet_hours_start ?? 22, profile.quiet_hours_end ?? 8, profile.timezone))) return false;
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

export function smsDestinationAllowed(phone: string): boolean {
  if (process.env.SMS_PAUSED === 'true') return false;
  const prefixes = (process.env.SMS_ALLOWED_PREFIXES ?? '+1').split(',').map(value => value.trim()).filter(value => /^\+\d{1,4}$/.test(value));
  return prefixes.some(prefix => phone.startsWith(prefix));
}
