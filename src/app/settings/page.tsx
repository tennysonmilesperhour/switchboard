import { NotificationChannels } from './NotificationChannels';
import { TimeZoneSelect } from './TimeZoneSelect';
import { timeZoneOptions } from '@/lib/time-zones';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supportEmail } from '@/lib/contact';
import { emailEnabled } from '@/lib/server/email';
import { AppShell } from '@/components/shell/AppShell';
import { errorFor, errorRef } from '@/lib/errors';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { SignOutForm } from '@/components/shell/SignOutForm';
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
import { upcomingHostedPlans } from '@/lib/server/hosted-plans';
import { BlockedPeople, type BlockedPerson } from './BlockedPeople';
import { CalendarSubscribe } from './CalendarSubscribe';
import { CalendarConnect } from './CalendarConnect';
import { ContactVerification } from './ContactVerification';
import { AppearanceSection } from './AppearancePicker';
import { resolveTheme } from '@/lib/themes-app';
import { parseCustomAppearance } from '@/lib/theme-custom';
import { anySettingsReadFailed, loadSettingsPage } from '@/lib/server/settings-page';
import { INTEREST_CATEGORIES, DOWN_TO_GROUP } from '@/lib/interests';
import {
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
    verifiedPhone,
    unverifiedEmail,
    phoneOptedOut,
    isModerator,
    smsPreferences,
    notificationRoutes,
    blocks,
    recoveryEmailMissing,
    failed,
  } = await loadSettingsPage(user);
  // Shown in the delete-account confirmation, so nobody deletes an account
  // without knowing which of their plans go with it.
  const hostedPlanCount = await upcomingHostedPlans(supabase, user.id)
    .then((plans) => plans.length)
    .catch(() => 0);
  const blockedPeople: BlockedPerson[] = blocks.map((row) => {
    const blocked = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.blocked_id,
      name: blocked?.display_name ?? 'Someone',
      handle: blocked?.handle ?? null,
    };
  });
  // A subscription belongs to the phone it was made for. After a number change
  // it no longer describes anything that can be texted.
  const currentSmsPreferences =
    smsPreferences && verifiedPhone && smsPreferences.phone === verifiedPhone
      ? smsPreferences
      : null;
  const calendarToken = privateProfile?.calendar_token ?? null;
  const pushConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

  // What is safe to render as editable. A control built from a read that failed
  // would show defaults, and saving it would write those defaults over the real
  // values — so it is hidden, and saving is off, until a reload brings it back.
  const loadFailure = errorFor('SB-SETTINGS-LOAD');
  const profileKnown = !failed.profile && Boolean(profile);
  const contactsKnown = !failed.private && !failed.contacts;
  const notificationsKnown =
    profileKnown && contactsKnown && !failed.sms && !failed.routes;
  const timeZones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])];
  // Labelled here, once: the browser's own zone data can spell and offset
  // zones differently, and labels computed again during hydration made React
  // throw the whole Settings page away (error #418, seen in CI).
  const savedZone = profile?.timezone || 'UTC';
  const timeZoneChoices = timeZoneOptions(timeZones, [savedZone]);

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
      <SettingsSaveProvider
        blocked={
          failed.profile ? { message: loadFailure.message, code: loadFailure.code } : null
        }
      >
        <div className="space-y-7">
          {anySettingsReadFailed(failed) && (
            <Card>
              <div role="alert">
                <ErrorNotice
                  message={loadFailure.message}
                  fix={loadFailure.fix}
                  code={loadFailure.code}
                />
              </div>
            </Card>
          )}

          {recoveryEmailMissing && (
            <Card tone="gold">
              <div role="status">
                <p className="text-sm font-bold text-ink">Add a way back into your account</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  You signed up with a username, so if you ever forget your password there is no
                  way to reset it until your account has a verified email.{' '}
                  {unverifiedEmail
                    ? `Verify ${unverifiedEmail} below — until then it can’t be used to recover your account.`
                    : 'Add one in your contact details, then verify it here.'}
                </p>
                {!unverifiedEmail && (
                  <Link
                    href="/profile/edit"
                    className="mt-3 inline-block text-sm font-bold text-terracotta-deep"
                  >
                    Add a recovery email
                  </Link>
                )}
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center gap-4">
              <Avatar name={profile?.display_name ?? 'You'} seed={user.id} size="lg" />
              <div>
                <p className="font-display text-xl">{profile?.display_name ?? 'You'}</p>
                {profile?.handle && (
                  <p className="text-sm text-ink-faint">@{profile.handle}</p>
                )}
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
            {profileKnown ? (
              <AppearanceSection
                current={resolveTheme(profile?.appearance_theme)}
                custom={parseCustomAppearance(profile?.appearance_custom)}
                userId={user.id}
                passportComplete={passportComplete}
              />
            ) : (
              <Card>
                <Unavailable />
              </Card>
            )}
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
                  {!['verified', 'claimed', 'expired'].includes(contactNotice) && (
                    <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide opacity-70">
                      {errorRef('SB-VERIFY-CHECK')}
                    </span>
                  )}
                </p>
              )}
              {contactsKnown ? (
                <ContactVerification
                  email={privateProfile?.contact_email ?? null}
                  phone={privateProfile?.contact_phone ?? null}
                  emailVerified={emailVerified}
                  phoneVerified={phoneVerified}
                />
              ) : (
                <Unavailable />
              )}
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
              {!profileKnown ? <Unavailable /> : (
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
              )}
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
              {!profileKnown ? <Unavailable /> : (
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
              )}
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
                  <PushManager serverConfigured={pushConfigured} />
                </div>

                {!notificationsKnown ? (
                  <div className="pt-5">
                    <Unavailable />
                  </div>
                ) : (
                  <>
                    <div className="py-5">
                      <NotificationPreferences initial={notificationPrefs} />
                      <DigestPreference
                        enabled={profile?.digest_enabled ?? false}
                        hour={profile?.digest_hour ?? 8}
                        pushAvailable={pushConfigured}
                        emailFallback={emailVerified && emailEnabled()}
                      />
                      <div className="mt-5">
                        <NotificationChannels
                          // A new or re-verified number is a different
                          // subscription; start its draft from the server.
                          key={`${verifiedPhone ?? 'none'}:${phoneOptedOut}`}
                          initialSms={currentSmsPreferences}
                          initialRoutes={notificationRoutes}
                          urgent={currentSmsPreferences?.urgent_changes ?? false}
                          phoneVerified={phoneVerified}
                          phoneOptedOut={phoneOptedOut}
                          emailVerified={emailVerified}
                          emailAvailable={emailEnabled()}
                          pushAvailable={pushConfigured}
                          fallback={
                            notificationRoutes?.sms_fallback_at && notificationRoutes.sms_fallback_reason
                              ? {
                                  at: notificationRoutes.sms_fallback_at,
                                  reason: notificationRoutes.sms_fallback_reason,
                                }
                              : null
                          }
                        />
                      </div>
                    </div>

                    <div className="pt-5">
                      <p className="text-sm font-bold text-ink">Quiet hours</p>
                      <p className="mt-0.5 mb-3 text-sm text-ink-soft leading-relaxed">
                        No pushes during these hours. A push that would have arrived then
                        isn’t sent later — it’s waiting in your notifications inbox instead.
                        Texts are held until the hours end.
                      </p>
                      <SettingsForm action={updateQuietHours} className="space-y-3">
                        <div className="flex flex-wrap items-end gap-3">
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
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="timezone" className="text-sm font-medium">
                            Your time zone
                          </label>
                          <TimeZoneSelect
                            id="timezone"
                            name="timezone"
                            initial={savedZone}
                            options={timeZoneChoices}
                          />
                          <p className="text-xs text-ink-faint">
                            Quiet hours, the daily summary and text messages all follow it.
                          </p>
                        </div>
                      </SettingsForm>
                    </div>
                  </>
                )}
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
              hint="Step back from the social side for a while"
            />
            <Card>
              {!profileKnown ? <Unavailable /> : (
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
                      You’ll drop out of friends’ radars, the map, discovery,
                      Mutual and matchmaking, your live signal and location share
                      are cleared, and rituals stop reminding you both.
                    </span>
                    <span className="block text-sm text-ink-soft mt-1.5 leading-relaxed">
                      Only plans you’re already in can still notify you: changes,
                      cancellations, reminders, host updates and messages.
                      Everything else waits in your inbox.
                    </span>
                    <span className="block text-sm text-ink-soft mt-1.5 leading-relaxed">
                      Friends can still invite you. They see your note on your
                      profile and when they pick you, and the invitation waits
                      in your inbox.
                    </span>
                  </span>
                </label>
                <input
                  name="sabbatical_message"
                  defaultValue={sabbaticalMessage}
                  maxLength={140}
                  placeholder="Taking a quiet season 🍃"
                  aria-label="Sabbatical note"
                  aria-describedby="sabbatical-note-hint"
                  className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
                />
                <p id="sabbatical-note-hint" className="text-xs text-ink-faint">
                  Your note shows on your profile, and to friends when they pick
                  you for a plan.
                </p>
              </SettingsForm>
              )}
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
            <SectionHeader title="Blocked" hint="People you’ve blocked. Only you see this list." />
            <Card>
              {failed.blocks ? <Unavailable /> : <BlockedPeople people={blockedPeople} />}
            </Card>
          </section>

          <section>
            <SectionHeader title="Account" hint="Password and account controls" />
            <Card>
              <AccountControls hostedPlanCount={hostedPlanCount} />
            </Card>
          </section>

          <section>
            <SectionHeader title="Support and legal" hint="Get help, or review privacy, terms, and community expectations" />
            <Card>
              <a href={`mailto:${supportEmail()}`} className="mb-3 block break-words rounded-card bg-paper px-3 py-2 text-sm font-bold text-terracotta-deep underline">
                Contact support
              </a>
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

          <SignOutForm>
            <Button type="submit" variant="ghost" className="w-full">
              Sign out
            </Button>
          </SignOutForm>
        </div>
      </SettingsSaveProvider>
    </AppShell>
  );
}

/**
 * Stands in for a section whose read failed. Showing its controls would mean
 * showing defaults, and a Save would then write those defaults over whatever
 * the person had actually chosen.
 */
function Unavailable() {
  return (
    <p className="text-sm text-ink-soft">
      Hidden until your settings load, so nothing here can be saved over what you chose.
      Reload the page to try again.
    </p>
  );
}
