import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { errorFor } from '@/lib/errors';
import type { EventStatus } from '@/lib/types';
import { reportOperationalError } from '@/lib/server/observability';
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

  // One row per room with that room's own latest message (G30). This used to
  // read the newest 1000 messages across every room and pick each room's
  // latest out of that, so a quiet room behind one busy one showed "No
  // messages yet" and never looked unread.
  const { data: inbox, error } = await supabase.rpc('my_room_inbox');
  if (error) {
    await reportOperationalError('room.inbox', error, { userId: user.id }, 'SB-ROOM-LOAD');
    return (
      <AppShell title="Rooms">
        <ErrorNotice
          code="SB-ROOM-LOAD"
          message={errorFor('SB-ROOM-LOAD').message}
          fix={errorFor('SB-ROOM-LOAD').fix}
        />
      </AppShell>
    );
  }
  const base = inbox ?? [];
  const ids = base.map((room) => room.room_id);

  const [{ data: memberRows }, { data: events }] = ids.length
    ? await Promise.all([
        supabase.from('room_members').select('room_id, member_id, profile:profiles(display_name)').in('room_id', ids),
        supabase.from('events').select('room_id, status, starts_at').in('room_id', ids),
      ])
    : [{ data: [] }, { data: [] }];

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
    // Generated RPC types mark every column non-null; a room with no messages
    // has nulls in the latest-message columns.
    const lastAt = (room.last_message_at as string | null) ?? null;
    const lastBody = (room.last_message_body as string | null) ?? null;
    const lastRead = (room.last_read_at as string | null) ?? null;
    const lastSender = (room.last_sender_id as string | null) ?? null;
    const event = eventByRoom.get(room.room_id);
    const past = Boolean(event && ENDED_EVENT_STATUSES.has(event.status));
    return {
      id: room.room_id,
      kind: room.kind,
      title: room.title,
      people: people.get(room.room_id) ?? [],
      preview: lastBody ?? 'No messages yet',
      activityAt: lastAt ?? room.room_created_at,
      // Your own message is never "unread" to you.
      unread: Boolean(
        lastAt && lastSender !== user.id && (!lastRead || lastAt > lastRead),
      ),
      muted: Boolean(room.muted),
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
