import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { signOut } from '@/lib/actions/profile';
import type { SwitchboardEvent } from '@/lib/types';
import { ProfileTabs, type ProfileEvent } from './ProfileTabs';

export const metadata: Metadata = { title: 'Profile' };

const FEATURE_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: '/people', label: 'People', icon: 'users' },
  { href: '/mutual', label: 'Mutual', icon: 'sparkle' },
  { href: '/moments', label: 'Moments', icon: 'chat' },
  { href: '/rooms', label: 'Rooms', icon: 'chat' },
  { href: '/zones', label: 'Zones', icon: 'mapPin' },
];

function toProfileEvent(event: SwitchboardEvent): ProfileEvent {
  return {
    id: event.id,
    title: event.title,
    starts_at: event.starts_at,
    location_name: event.location_name,
    status: event.status,
  };
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, handle, avatar_url, bio, interests, down_to')
    .eq('id', user.id)
    .single();

  const [{ data: created }, { data: attendedRows }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('host_id', user.id)
      .order('starts_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('invites')
      .select('event:events(*)')
      .eq('invitee_id', user.id)
      .eq('status', 'accepted'),
  ]);

  const attended = (attendedRows ?? [])
    .map((row) => (Array.isArray(row.event) ? row.event[0] : row.event) as SwitchboardEvent | null)
    .filter((event): event is SwitchboardEvent => event !== null && event.host_id !== user.id)
    .map(toProfileEvent);

  const interests: string[] = profile?.interests ?? [];
  const downTo: string[] = profile?.down_to ?? [];
  const tags = [...downTo, ...interests].slice(0, 6);

  return (
    <AppShell
      title="Profile"
      action={
        <Link
          href="/settings"
          aria-label="Edit profile and settings"
          className="size-9 inline-flex items-center justify-center rounded-full text-terracotta-deep hover:bg-cream"
        >
          <Icon name="edit" size={20} />
        </Link>
      }
    >
      <div className="space-y-8">
        {/* Identity */}
        <div className="flex flex-col items-center text-center">
          <Avatar
            name={profile?.display_name ?? 'You'}
            seed={user.id}
            src={profile?.avatar_url}
            size="xl"
            className="shadow-lift"
          />
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">
            {profile?.display_name}
          </h2>
          <p className="text-sm text-ink-faint">@{profile?.handle}</p>
          {profile?.bio ? (
            <p className="mt-2 max-w-xs text-sm text-ink-soft">{profile.bio}</p>
          ) : null}
          {tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-pill bg-terracotta-soft px-3 py-1 text-xs font-semibold text-terracotta-deep"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Created / Attended / Activity */}
        <ProfileTabs
          created={(created ?? []).map(toProfileEvent)}
          attended={attended}
        />

        {/* Everything else */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            More
          </h3>
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {FEATURE_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-cream ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <span className="text-terracotta">
                  <Icon name={link.icon} size={22} />
                </span>
                <span className="flex-1 font-semibold text-ink">{link.label}</span>
                <span className="text-ink-faint">
                  <Icon name="back" size={18} className="rotate-180" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-btn border border-line py-3 text-sm font-bold text-ink-soft hover:bg-cream"
          >
            <Icon name="logout" size={18} />
            Sign out
          </button>
        </form>
      </div>
    </AppShell>
  );
}
