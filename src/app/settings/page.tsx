import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PushManager } from '@/components/push/PushManager';
import { signOut, updateQuietHours } from '@/lib/actions/profile';

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
    .select('display_name, handle, interests, quiet_hours_start, quiet_hours_end')
    .eq('id', user.id)
    .single();

  return (
    <AppShell title="Settings" back="/">
      <div className="space-y-7">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={profile?.display_name ?? 'You'} seed={user.id} size="lg" />
            <div>
              <p className="font-display text-xl">{profile?.display_name}</p>
              <p className="text-sm text-ink-faint">@{profile?.handle}</p>
            </div>
          </div>
          {(profile?.interests?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {profile?.interests.map((interest: string) => (
                <span key={interest} className="rounded-pill bg-cream px-2.5 py-1 text-xs text-ink-soft">
                  {interest}
                </span>
              ))}
            </div>
          )}
        </Card>

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
              <Button type="submit" size="sm" variant="secondary">Save</Button>
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
