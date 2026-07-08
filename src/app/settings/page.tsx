import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PushManager } from '@/components/push/PushManager';
import { InterestPicker } from '@/components/profile/InterestPicker';
import { SaveButton } from './SaveButton';
import { INTEREST_CATEGORIES, DOWN_TO_GROUP } from '@/lib/interests';
import {
  signOut,
  updateInterests,
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

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'display_name, handle, interests, down_to, sabbatical, sabbatical_message, quiet_hours_start, quiet_hours_end',
    )
    .eq('id', user.id)
    .single();

  const interests: string[] = profile?.interests ?? [];
  const downTo: string[] = profile?.down_to ?? [];
  const sabbatical: boolean = profile?.sabbatical ?? false;
  const sabbaticalMessage: string = profile?.sabbatical_message ?? '';

  return (
    <AppShell title="Settings" back="/profile">
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
            title="Interests & activities"
            hint="Help Switchboard suggest the right people and plans"
          />
          <Card>
            <form action={updateInterests} className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-medium text-ink">Interests</p>
                <InterestPicker
                  name="interests"
                  groups={INTEREST_CATEGORIES}
                  initialSelected={interests}
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
              <SaveButton />
            </form>
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Notifications"
            hint="Matches, invitations, and confirmed plans"
          />
          <Card>
            <PushManager />
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Quiet hours"
            hint="No pushes during these hours - they simply wait"
          />
          <Card>
            <form action={updateQuietHours} className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1">
                <label htmlFor="quiet_start" className="text-sm font-medium">From</label>
                <select
                  id="quiet_start"
                  name="quiet_start"
                  defaultValue={profile?.quiet_hours_start ?? ''}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm"
                >
                  <option value="">Off</option>
                  {HOURS.map((hour) => (
                    <option key={hour.value} value={hour.value}>{hour.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 flex-1">
                <label htmlFor="quiet_end" className="text-sm font-medium">Until</label>
                <select
                  id="quiet_end"
                  name="quiet_end"
                  defaultValue={profile?.quiet_hours_end ?? ''}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm"
                >
                  <option value="">Off</option>
                  {HOURS.map((hour) => (
                    <option key={hour.value} value={hour.value}>{hour.label}</option>
                  ))}
                </select>
              </div>
              <SaveButton />
            </form>
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Sabbatical"
            hint="Pause signals, radar, and matchmaking for a while"
          />
          <Card>
            <form action={updateSabbatical} className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="sabbatical"
                  defaultChecked={sabbatical}
                  className="mt-1 size-4 accent-[oklch(60%_0.128_42)]"
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
              <SaveButton />
            </form>
          </Card>
        </section>

        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
