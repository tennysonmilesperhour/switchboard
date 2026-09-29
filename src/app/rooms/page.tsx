import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import type { EventStatus } from '@/lib/types';
import { RoomsInbox, type InboxRoom } from './RoomsInbox';

export const metadata: Metadata = { title: 'Rooms' };

/**
 * A plan in one of these states has its room filed under Past. Built from
 * `EventStatus` literals so a status that doesn't exist fails to compile — this
 * list once said 'completed', which is not a status, and past plans' rooms
 * never left the active list. (`events.status` is typed `string` in the
 * generated database types, hence the widening to a string set for lookup.)
 */
const ENDED_EVENT_STATUSES: ReadonlySet<string> = new Set<EventStatus>(['cancelled', 'past']);

export default async function RoomsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('room_members')
    .select('last_read_at, room:rooms(id, kind, title, created_at)')
    .eq('member_id', user.id);
  const base = (memberships ?? []).flatMap((membership) => {
    const room = Array.isArray(membership.room) ? membership.room[0] : membership.room;
    return room ? [{ ...room, last_read_at: membership.last_read_at as string | null }] : [];
  });
  const ids = base.map((room) => room.id);

  const [{ data: messages }, { data: memberRows }, { data: events }] = ids.length
    ? await Promise.all([
        supabase.from('messages').select('room_id, body, created_at').in('room_id', ids).order('created_at', { ascending: false }).limit(1000),
        supabase.from('room_members').select('room_id, member_id, profile:profiles(display_name)').in('room_id', ids),
        supabase.from('events').select('room_id, status, starts_at').in('room_id', ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const latest = new Map<string, { body: string; created_at: string }>();
  for (const message of messages ?? []) {
    if (!latest.has(message.room_id)) latest.set(message.room_id, message);
  }
  const people = new Map<string, string[]>();
  for (const row of memberRows ?? []) {
    if (row.member_id === user.id) continue;
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const names = people.get(row.room_id) ?? [];
    names.push(profile?.display_name ?? 'Member');
    people.set(row.room_id, names);
  }
  const eventByRoom = new Map((events ?? []).map((event) => [event.room_id, event]));
  const rooms: InboxRoom[] = base.map((room) => {
    const message = latest.get(room.id);
    const activityAt = message?.created_at ?? room.created_at;
    const event = eventByRoom.get(room.id);
    const past = Boolean(event && ENDED_EVENT_STATUSES.has(event.status));
    return {
      id: room.id,
      kind: room.kind,
      title: room.title,
      people: people.get(room.id) ?? [],
      preview: message?.body ?? 'No messages yet',
      activityAt,
      unread: Boolean(message && (!room.last_read_at || message.created_at > room.last_read_at)),
      section: past ? 'past' : room.kind === 'match' ? 'matches' : 'active',
    };
  });

  return (
    <AppShell title="Rooms">
      {rooms.length === 0 ? (
        <EmptyState emoji="💬" title="No rooms yet" body="Every plan and match gets a room where the details stay together." />
      ) : <RoomsInbox rooms={rooms} />}
    </AppShell>
  );
}
