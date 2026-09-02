import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCalendarStatus } from '@/lib/actions/calendar-sync';
import { loadPassport } from '@/lib/server/passport';
import { passportProgress } from '@/lib/passport';
import { reportOperationalError } from '@/lib/server/observability';

const PROFILE_COLUMNS =
  'display_name, handle, interests, down_to, sabbatical, sabbatical_message, ' +
  'quiet_hours_start, quiet_hours_end, discoverable, discovery_geography, ' +
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
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .single<SettingsProfile>(),
    supabase.rpc('my_private_profile').maybeSingle<{
      calendar_token: string;
      contact_email: string | null;
      contact_phone: string | null;
    }>(),
    getCalendarStatus(),
    loadPassport(user.id),
    supabase.from('profile_contacts').select('kind, verified_at'),
    supabase.rpc('is_current_user_platform_moderator'),
  ]);

  if (profileResult.error) {
    await reportOperationalError('settings.appearance-read', profileResult.error, {
      userId: user.id,
    });
  }

  const contacts = contactsResult.data ?? [];
  return {
    profile: profileResult.data,
    privateProfile: privateProfileResult.data,
    calendarStatus,
    passportComplete: passportProgress(passport).done,
    emailVerified: contacts.some(
      (contact) => contact.kind === 'email' && Boolean(contact.verified_at),
    ),
    phoneVerified: contacts.some(
      (contact) => contact.kind === 'phone' && Boolean(contact.verified_at),
    ),
    isModerator: Boolean(moderatorResult.data),
  };
}
