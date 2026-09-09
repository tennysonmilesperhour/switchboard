import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ contact: { user_id: 'original' }, prefs: { enabled: true, plans: true, reminders: false, urgent_changes: false, phone: '+15555550100' }, route: { plans: 'existing', reminders: 'existing' }, quiet: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ isQuietTime: mocks.quiet }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (name: string) => {
  const chain = { select: () => chain, eq: () => chain, not: () => chain, maybeSingle: async () => ({ data: name === 'profile_contacts' ? mocks.contact : name === 'sms_preferences' ? mocks.prefs : name === 'notification_routes' ? mocks.route : { timezone: 'UTC', quiet_hours_start: null, quiet_hours_end: null }, error: null }) }; return chain;
} }) }));
import { smsConsentAllows } from './sms-policy';
beforeEach(() => { mocks.contact.user_id = 'original'; mocks.prefs.enabled = true; mocks.prefs.phone = '+15555550100'; mocks.route.plans = 'existing'; mocks.prefs.urgent_changes = false; mocks.quiet.mockReturnValue(false); });
test('permits current verified recipient with explicit category consent', async () => { expect(await smsConsentAllows('+15555550100', 'plans', 'original')).toBe(true); });
test('never sends old queued messages to a recycled phone owner', async () => { mocks.contact.user_id = 'new-owner'; expect(await smsConsentAllows('+15555550100', 'plans', 'original')).toBe(false); });
test('suppresses a disabled category', async () => { expect(await smsConsentAllows('+15555550100', 'reminders', 'original')).toBe(false); });
test('suppresses withdrawn consent', async () => { mocks.prefs.enabled = false; expect(await smsConsentAllows('+15555550100', 'plans')).toBe(false); });
test('suppresses messages during quiet hours', async () => { mocks.quiet.mockReturnValue(true); expect(await smsConsentAllows('+15555550100', 'plans')).toBe(false); expect(mocks.quiet).toHaveBeenCalledWith(22, 8, 'UTC'); });

test.each(['email', 'push', 'in_app'])('channel %s suppresses SMS at send time', async channel => {
 mocks.route.plans = channel;
 expect(await smsConsentAllows('+15555550100', 'plans', 'original')).toBe(false);
});
test('only explicit urgent permission bypasses quiet hours before expiry', async () => {
 mocks.quiet.mockReturnValue(true);
 const until = new Date(Date.now() + 60_000).toISOString();
 expect(await smsConsentAllows('+15555550100', 'plans', 'original', undefined, until)).toBe(false);
 mocks.prefs.urgent_changes = true;
 expect(await smsConsentAllows('+15555550100', 'plans', 'original', undefined, until)).toBe(true);
 expect(await smsConsentAllows('+15555550100', 'plans', 'original', undefined, new Date(0).toISOString())).toBe(false);
});
