import { NotificationRoutes } from './NotificationRoutes';
import { SmsPreferences } from './SmsPreferences';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { PushManager } from '@/components/push/PushManager';
import { NotificationPreferences } from '@/components/settings/NotificationPreferences';
import { DigestPreference } from '@/components/settings/DigestPreference';
import { ShowTipsAgain } from '@/components/settings/ShowTipsAgain';
import { InterestPicker } from '@/components/profile/InterestPicker';
import { SettingsForm, SettingsSaveProvider } from './SettingsSaveBar';
import { AccountControls } from './AccountControls';
import { CalendarSubscribe } from './CalendarSubscribe';
import { CalendarConnect } from './CalendarConnect';
import { ContactVerification } from './ContactVerification';
import { AppearanceSection } from './AppearancePicker';
import { resolveTheme } from '@/lib/themes-app';
import { parseCustomAppearance } from '@/lib/theme-custom';
import { loadSettingsPage } from '@/lib/server/settings-page';
import { INTEREST_CATEGORIES, DOWN_TO_GROUP } from '@/lib/interests';
import {
  signOut,
  updateInterests,
  updateDiscoverability,
  updateQuietHours,
  updateSabbatical,
} from '@/lib/actions/profile';

export const metadata: Metadata = { title: 'Settings' };

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', {
    hour: 'numeric',
  }),
}));

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  const { contact: contactNotice } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const {
    profile,
    privateProfile,
    calendarStatus,
    passportComplete,
    emailVerified,
    phoneVerified,
    isModerator,
  } = await loadSettingsPage(user);
  const { data: smsPreferences } = await supabase.from('sms_preferences').select('enabled, plans, reminders, phone, urgent_changes').eq('user_id', user.id).maybeSingle();
  const { data: notificationRoutes } = await supabase.from('notification_routes').select('plans, reminders').eq('user_id', user.id).maybeSingle();
  const currentSmsPreferences = smsPreferences && smsPreferences.phone === privateProfile?.contact_phone ? smsPreferences : null;
  const calendarToken = privateProfile?.calendar_token ?? null;

  const interests: string[] = profile?.interests ?? [];
  const downTo: string[] = profile?.down_to ?? [];
  const sabbatical: boolean = profile?.sabbatical ?? false;
  const sabbaticalMessage: string = profile?.sabbatical_message ?? '';
  const discoveryContexts: string[] = profile?.discovery_contexts ?? [];

  // Notification categories default on; a null (pre-migration) reads as enabled.
  const notificationPrefs = {
    plans: profile?.notify_plans ?? true,
    suggestions: profile?.notify_suggestions ?? true,
    reminders: profile?.notify_reminders ?? true,
    messages: profile?.notify_messages ?? true,
    social: profile?.notify_social ?? true,
  };

  return (
    <AppShell title="Settings" back="/profile">
      <SettingsSaveProvider>
        <div className="space-y-7">
          <Card>
            <div className="flex items-center gap-4">
              <Avatar name={profile?.display_name ?? 'You'} seed={user.id} size="lg" />
              <div>
                <p className="font-display text-xl">{profile?.display_name}</p>
                <p className="text-sm text-ink-faint">@{profile?.handle}</p>
              </div>
            </div>
            {(interests.length > 0 || downTo.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {interests.map((interest) => (
                  <span key={interest} className="rounded-pill bg-cream px-2.5 py-1 text-xs text-ink-soft">
                    {interest}
                  </span>
                ))}
                {downTo.map((activity) => (
                  <span key={activity} className="rounded-pill bg-terracotta-soft px-2.5 py-1 text-xs text-terracotta-deep">
                    {activity}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <section>
            <SectionHeader
              title="Appearance"
              hint="How Switchboard looks, on every device you sign in on"
            />
            <AppearanceSection
              current={resolveTheme(profile?.appearance_theme)}
              custom={parseCustomAppearance(profile?.appearance_custom)}
              userId={user.id}
              passportComplete={passportComplete}
            />
          </section>

          <section>
            <SectionHeader
              title="Verified contact details"
              hint="Only verified details can match contacts or route invitations to your account"
            />
            <Card>
              {contactNotice && (
                <p
                  role={contactNotice === 'verified' ? 'status' : 'alert'}
                  className={`mb-4 text-sm ${
                    contactNotice === 'verified' ? 'text-sage-deep' : 'text-rose-deep'
                  }`}
                >
                  {contactNotice === 'verified'
                    ? 'Email verified.'
                    : contactNotice === 'claimed'
                      ? 'That email is already verified on another account.'
                      : contactNotice === 'expired'
                        ? 'That verification link expired. Request a new one.'
                        : 'Email verification could not be completed.'}
                </p>
              )}
              <ContactVerification
                email={privateProfile?.contact_email ?? null}
                phone={privateProfile?.contact_phone ?? null}
                emailVerified={emailVerified}
                phoneVerified={phoneVerified}
              />
              <Link href="/profile/edit" className="mt-4 inline-block text-sm font-bold text-terracotta-deep">
                Edit contact details
              </Link>
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Interests & activities"
              hint="Help Switchboard suggest the right people and plans"
            />
            <Card>
              <SettingsForm action={updateInterests} className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-ink">Interests</p>
                  <InterestPicker
                    name="interests"
                    groups={INTEREST_CATEGORIES}
                    initialSelected={interests}
                    collapsible
                  />
                </div>
                <div className="space-y-3 border-t border-line pt-6">
                  <p className="text-sm font-medium text-ink">
                    Usually down to…
                  </p>
                  <InterestPicker
                    name="down_to"
                    groups={[DOWN_TO_GROUP]}
                    initialSelected={downTo}
                    searchable={false}
                  />
                </div>
              </SettingsForm>
            </Card>
          </section>

          {/* Both directions of "your calendar", together: publish your plans
              out, and read your own week in. Someone looking for either finds
              the other, which is most of what makes the pair legible. */}
          <section>
            <SectionHeader
              title="Your calendar"
              hint="Follow your plans from any calendar app — and let Switchboard see when you’re busy"
            />
            <div className="space-y-3">
              {calendarToken && (
                <Card>
                  <CalendarSubscribe token={calendarToken} />
                </Card>
              )}
              <Card>
                <CalendarConnect status={calendarStatus} />
              </Card>
            </div>
          </section>

          <section>
            <SectionHeader
              title="Discoverability"
              hint="Choose how new people can find you. Interest stays private unless it is mutual."
            />
            <Card>
              <SettingsForm action={updateDiscoverability} className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="discoverable"
                    defaultChecked={profile?.discoverable ?? false}
                    className="mt-1 size-4 accent-terracotta"
                  />
                  <span>
                    <span className="font-medium">Show me in people discovery</span>
                    <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                      People can quietly mark interest in connecting around a shared context.
                      No one is notified unless you choose each other.
                    </span>
                  </span>
                </label>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['discovery_geography', 'Geography', 'Use your profile location.'],
                    ['discovery_demographics', 'Demographics', 'Use visible profile details.'],
                    ['discovery_interests', 'Interests', 'Use your selected interests.'],
                    ['discovery_involvements', 'Involvements', 'Use contexts you list below.'],
                    ['discovery_mutuals', 'Mutual friends', 'Rank higher with shared friends.'],
                  ].map(([name, label, hint]) => (
                    <label
                      key={name}
                      className="flex items-start gap-2 rounded-card border border-line bg-paper px-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        name={name}
                        defaultChecked={Boolean(profile?.[name as keyof typeof profile])}
                        className="mt-1 size-4 accent-terracotta"
                      />
                      <span>
                        <span className="block text-sm font-bold text-ink">{label}</span>
                        <span className="block text-xs text-ink-faint">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="discovery_contexts" className="text-sm font-medium">
                    Contexts you are open to
                  </label>
                  <textarea
                    id="discovery_contexts"
                    name="discovery_contexts"
                    defaultValue={discoveryContexts.join('\n')}
                    rows={4}
                    placeholder="Local volunteering&#10;Startup friends&#10;Parents nearby&#10;Trail running"
                    className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
                  />
                  <p className="text-xs text-ink-faint">
                    One per line. These become the specific contexts people can mutually match around.
                  </p>
                </div>
              </SettingsForm>
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Notifications"
              hint="Control what reaches you, and when"
            />
            <Card>
              <div className="divide-y divide-line">
                <div className="pb-5">
                  <PushManager serverConfigured={Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)} />
                </div>

                <div className="py-5">
                  <NotificationPreferences initial={notificationPrefs} />
                  <SmsPreferences key={`${privateProfile?.contact_phone}:${phoneVerified}`} initial={currentSmsPreferences} verified={phoneVerified} />
                  <NotificationRoutes initial={notificationRoutes} urgent={currentSmsPreferences?.urgent_changes ?? false} smsEnabled={Boolean(currentSmsPreferences?.enabled && phoneVerified)} emailVerified={emailVerified} />
                  <DigestPreference
                    enabled={profile?.digest_enabled ?? false}
                    hour={profile?.digest_hour ?? 8}
                  />
                </div>

                <div className="pt-5">
                  <p className="text-sm font-bold text-ink">Quiet hours</p>
                  <p className="mt-0.5 mb-3 text-sm text-ink-soft leading-relaxed">
                    No pushes during these hours — they simply wait for you.
                  </p>
                  <SettingsForm
                    action={updateQuietHours}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <div className="space-y-1.5 flex-1">
                      <label htmlFor="quiet_start" className="text-sm font-medium">
                        From
                      </label>
                      <select
                        id="quiet_start"
                        name="quiet_start"
                        defaultValue={profile?.quiet_hours_start ?? ''}
                        className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm"
                      >
                        <option value="">Off</option>
                        {HOURS.map((hour) => (
                          <option key={hour.value} value={hour.value}>
                            {hour.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <label htmlFor="quiet_end" className="text-sm font-medium">
                        Until
                      </label>
                      <select
                        id="quiet_end"
                        name="quiet_end"
                        defaultValue={profile?.quiet_hours_end ?? ''}
                        className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm"
                      >
                        <option value="">Off</option>
                        {HOURS.map((hour) => (
                          <option key={hour.value} value={hour.value}>
                            {hour.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </SettingsForm>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Getting started"
              hint="Bring back the first-steps checklist on Home"
            />
            <Card>
              <ShowTipsAgain />
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Everything Switchboard does"
              hint="Every feature and where to find it"
            />
            <Card>
              <Link href="/features" className="font-medium text-terracotta-deep">
                Open the feature index
              </Link>
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Sabbatical"
              hint="Pause signals, radar, and matchmaking for a while"
            />
            <Card>
              <SettingsForm action={updateSabbatical} className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="sabbatical"
                    defaultChecked={sabbatical}
                    className="mt-1 size-4 accent-terracotta"
                  />
                  <span>
                    <span className="font-medium">Take a quiet season</span>
                    <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                      You’ll stop appearing on friends’ radars, in matchmaking, and
                      your live signal is cleared. Friends who reach out see your
                      note instead of silence.
                    </span>
                  </span>
                </label>
                <input
                  name="sabbatical_message"
                  defaultValue={sabbaticalMessage}
                  maxLength={140}
                  placeholder="Taking a quiet season 🍃"
                  aria-label="Sabbatical note"
                  className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
                />
              </SettingsForm>
            </Card>
          </section>

          {isModerator && (
            <section>
              <SectionHeader title="Moderation" hint="Review reports and venue claims" />
              <Card>
                <Link
                  href="/moderation"
                  className="flex items-center justify-between rounded-card bg-paper px-3 py-2.5 text-sm font-bold text-terracotta-deep hover:text-terracotta-deep"
                >
                  Open the moderation queue
                  <span aria-hidden>→</span>
                </Link>
              </Card>
            </section>
          )}

          <section>
            <SectionHeader title="Account" hint="Password and account controls" />
            <Card>
              <AccountControls />
            </Card>
          </section>

          <section>
            <SectionHeader title="Legal" hint="Privacy, terms, copyright, and community expectations" />
            <Card>
              <div className="grid grid-cols-2 gap-2 text-sm font-bold text-terracotta-deep">
                <Link href="/privacy" className="rounded-card bg-paper px-3 py-2 hover:text-terracotta-deep">
                  Privacy
                </Link>
                <Link href="/terms" className="rounded-card bg-paper px-3 py-2 hover:text-terracotta-deep">
                  Terms
                </Link>
                <Link href="/community" className="rounded-card bg-paper px-3 py-2 hover:text-terracotta-deep">
                  Community
                </Link>
                <Link href="/copyright" className="rounded-card bg-paper px-3 py-2 hover:text-terracotta-deep">
                  Copyright
                </Link>
              </div>
            </Card>
          </section>

          <form action={signOut}>
            <Button type="submit" variant="ghost" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </SettingsSaveProvider>
    </AppShell>
  );
}
