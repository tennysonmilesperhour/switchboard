import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { getCalendarStatus } from '@/lib/actions/calendar-sync';
import { loadPassport } from '@/lib/server/passport';
import { passportProgress } from '@/lib/passport';
import { reportOperationalError } from '@/lib/server/observability';
import { USERNAME_EMAIL_DOMAIN } from '@/lib/auth-identity';

const PROFILE_COLUMNS =
  'display_name, handle, interests, down_to, sabbatical, sabbatical_message, ' +
  'quiet_hours_start, quiet_hours_end, timezone, discoverable, discovery_geography, ' +
  'discovery_demographics, discovery_interests, discovery_involvements, ' +
  'discovery_mutuals, discovery_contexts, notify_plans, notify_suggestions, ' +
  'notify_reminders, notify_messages, notify_social, appearance_theme, ' +
  'appearance_custom, digest_enabled, digest_hour';

interface SettingsProfile {
  display_name: string | null;
  handle: string | null;
  interests: string[] | null;
  down_to: string[] | null;
  sabbatical: boolean | null;
  sabbatical_message: string | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  timezone: string | null;
  discoverable: boolean | null;
  discovery_geography: boolean | null;
  discovery_demographics: boolean | null;
  discovery_interests: boolean | null;
  discovery_involvements: boolean | null;
  discovery_mutuals: boolean | null;
  discovery_contexts: string[] | null;
  notify_plans: boolean | null;
  notify_suggestions: boolean | null;
  notify_reminders: boolean | null;
  notify_messages: boolean | null;
  notify_social: boolean | null;
  appearance_theme: string | null;
  appearance_custom: unknown;
  digest_enabled: boolean | null;
  digest_hour: number | null;
}

export interface SettingsSmsPreferences {
  enabled: boolean;
  plans: boolean;
  reminders: boolean;
  phone: string;
  urgent_changes: boolean;
}

export type SmsRouteFallbackReason = 'sms_off' | 'category_off' | 'stopped' | 'phone_changed';

export interface SettingsNotificationRoutes {
  plans: string;
  reminders: string;
  sms_fallback_at: string | null;
  sms_fallback_reason: SmsRouteFallbackReason | null;
}

/**
 * The reads Settings depends on. A part that failed is `true` here, and the
 * page hides every control built from it instead of rendering defaults: a
 * profile read that failed used to show every switch in its default position,
 * and the next Save wrote those defaults over what the person had chosen.
 */
export interface SettingsReadFailures {
  profile: boolean;
  private: boolean;
  contacts: boolean;
  sms: boolean;
  routes: boolean;
  blocks: boolean;
}

export function anySettingsReadFailed(failed: SettingsReadFailures): boolean {
  return Object.values(failed).some(Boolean);
}

/**
 * Whether this account can only be recovered through an email it has not added
 * yet: a username sign-up (synthetic login address) with no verified email
 * contact. `/forgot-password` can do nothing for it, so Settings says so while
 * there is still time to fix it (docs/AUTH.md, decision 14).
 */
export function needsRecoveryEmail(
  loginEmail: string | null | undefined,
  emailVerified: boolean,
): boolean {
  if (emailVerified) return false;
  return !loginEmail || loginEmail.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

/**
 * Whether this deployment's own copy of the reader's STOP list says their
 * verified phone opted out. Read with the service role because the list is
 * deliberately closed to browsers; the number is the caller's own, already
 * verified, so nothing about anyone else is looked up.
 */
async function phoneOptedOut(phone: string | null): Promise<boolean> {
  if (!phone || !hasAdminCredentials()) return false;
  const { data, error } = await createAdminClient()
    .from('sms_opt_outs')
    .select('normalized_number')
    .eq('normalized_number', phone)
    .maybeSingle();
  // Advisory only (it decides whether to explain a STOP); the send path keeps
  // its own fail-closed check.
  return !error && Boolean(data);
}

/** Load every independent Settings read in one batch after authentication. */
export async function loadSettingsPage(user: User) {
  const supabase = await createClient();
  const [
    profileResult,
    privateProfileResult,
    calendarStatus,
    passport,
    contactsResult,
    moderatorResult,
    smsResult,
    routesResult,
    blocksResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle<SettingsProfile>(),
    supabase.rpc('my_private_profile').maybeSingle<{
      calendar_token: string;
      contact_email: string | null;
      contact_phone: string | null;
    }>(),
    getCalendarStatus(),
    loadPassport(user.id),
    supabase.from('profile_contacts').select('kind, verified_at, normalized_value'),
    supabase.rpc('is_current_user_platform_moderator'),
    supabase
      .from('sms_preferences')
      .select('enabled, plans, reminders, phone, urgent_changes')
      .eq('user_id', user.id)
      .maybeSingle<SettingsSmsPreferences>(),
    supabase
      .from('notification_routes')
      .select('plans, reminders, sms_fallback_at, sms_fallback_reason')
      .eq('user_id', user.id)
      .maybeSingle<SettingsNotificationRoutes>(),
    supabase
      .from('profile_blocks')
      .select('blocked_id, profile:profiles!profile_blocks_blocked_id_fkey(display_name, handle)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const failed: SettingsReadFailures = {
    // No row at all is a failure too: every control on the page is built from
    // it, and "no row" rendered as defaults is exactly the overwrite hazard.
    profile: Boolean(profileResult.error) || !profileResult.data,
    private: Boolean(privateProfileResult.error),
    contacts: Boolean(contactsResult.error),
    sms: Boolean(smsResult.error),
    routes: Boolean(routesResult.error),
    blocks: Boolean(blocksResult.error),
  };

  const errors: Array<[keyof SettingsReadFailures, unknown]> = [
    ['profile', profileResult.error ?? (profileResult.data ? null : { message: 'no profile row' })],
    ['private', privateProfileResult.error],
    ['contacts', contactsResult.error],
    ['sms', smsResult.error],
    ['routes', routesResult.error],
    ['blocks', blocksResult.error],
  ];
  await Promise.all(
    errors
      .filter(([, error]) => error)
      .map(([part, error]) =>
        reportOperationalError('settings.load', error, { userId: user.id, part }),
      ),
  );

  const contacts = contactsResult.data ?? [];
  const emailVerified = contacts.some(
    (contact) => contact.kind === 'email' && Boolean(contact.verified_at),
  );
  const verifiedPhone =
    contacts.find((contact) => contact.kind === 'phone' && Boolean(contact.verified_at))
      ?.normalized_value ?? null;
  const unverifiedEmail =
    contacts.find((contact) => contact.kind === 'email' && !contact.verified_at)
      ?.normalized_value ?? null;

  return {
    profile: profileResult.data,
    privateProfile: privateProfileResult.data,
    calendarStatus,
    passportComplete: passportProgress(passport).done,
    emailVerified,
    phoneVerified: Boolean(verifiedPhone),
    /** The verified phone, normalized — what an SMS subscription is bound to. */
    verifiedPhone,
    /** An email typed into the profile that has not been proven yet. */
    unverifiedEmail,
    phoneOptedOut: await phoneOptedOut(verifiedPhone),
    isModerator: Boolean(moderatorResult.data),
    smsPreferences: smsResult.data,
    notificationRoutes: routesResult.data,
    blocks: blocksResult.data ?? [],
    recoveryEmailMissing:
      !failed.contacts && needsRecoveryEmail(user.email, emailVerified),
    failed,
  };
}
