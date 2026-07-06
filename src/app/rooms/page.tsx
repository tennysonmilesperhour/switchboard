import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { formatRelative } from '@/lib/format';

export const metadata: Metadata = { title: 'Rooms' };

const KIND_ICON: Record<string, IconName> = {
  event: 'calendar',
  match: 'sparkle',
  group: 'users',
  moment: 'sparkle',
};

export default async function RoomsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('room_members')
    .select('room:rooms(id, kind, title, created_at)')
    .eq('member_id', user.id);

  const rooms = (memberships ?? [])
    .map((m) => (Array.isArray(m.room) ? m.room[0] : m.room))
    .filter((room): room is NonNullable<typeof room> => Boolean(room))
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return (
    <AppShell title="Rooms">
      {rooms.length === 0 ? (
        <EmptyState
          emoji="💬"
          title="No rooms yet"
          body="Every plan and match gets a Living Room - a conversation where addresses, tasks, links, and photos quietly organize themselves."
        />
      ) : (
        <div className="space-y-2.5">
          {rooms.map((room) => (
            <Link key={room.id} href={`/rooms/${room.id}`} className="block group">
              <Card className="group-hover:border-terracotta transition-colors">
                <div className="flex items-center gap-3">
                  <span
                    className="size-11 rounded-full bg-terracotta-soft text-terracotta-deep inline-flex items-center justify-center"
                    aria-hidden
                  >
                    <Icon name={KIND_ICON[room.kind] ?? 'chat'} size={20} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{room.title}</p>
                    <p className="text-xs text-ink-faint">
                      {room.kind === 'match' ? 'Mutual match' : room.kind === 'event' ? 'Plan' : 'Group'} ·
                      started {formatRelative(room.created_at)}
                    </p>
                  </div>
                  <Icon
                    name="back"
                    size={18}
                    className="text-ink-faint rotate-180 group-hover:text-terracotta transition-colors"
                  />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
