import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import {
  RoomClient,
  type RoomItemRow,
} from './RoomClient';

function roomItemKind(kind: string): RoomItemRow['kind'] {
  switch (kind) {
    case 'event':
    case 'address':
    case 'task':
    case 'link':
    case 'photo':
    case 'note':
      return kind;
    default:
      return 'note';
  }
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: room } = await supabase
    .from('rooms')
    .select('id, kind, title')
    .eq('id', id)
    .single();
  if (!room) notFound();

  const [{ data: members }, { data: messages }, { data: items }, { data: expenses }] =
    await Promise.all([
      supabase
        .from('room_members')
        .select('member_id, profile:profiles(display_name)')
        .eq('room_id', id),
      // The newest 200, not the oldest: ascending + limit returned the first
      // 200 ever sent, so a busy room opened on a months-old conversation and
      // never showed anything said after message 200. Reversed below.
      supabase
        .from('messages')
        .select('id, sender_id, body, image_url, created_at')
        .eq('room_id', id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('room_items')
        .select('*')
        .eq('room_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('expenses')
        .select('*')
        .eq('room_id', id)
        .order('created_at', { ascending: false }),
    ]);

  const memberNames: Record<string, string> = {};
  for (const member of members ?? []) {
    const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    memberNames[member.member_id] = profile?.display_name ?? 'Member';
  }

  return (
    <AppShell title={room.title} back="/rooms">
      <RoomClient
        roomId={room.id}
        currentUserId={user.id}
        memberNames={memberNames}
        initialMessages={(messages ?? []).reverse()}
        items={(items ?? []).map((item) => ({ ...item, kind: roomItemKind(item.kind) }))}
        expenses={expenses ?? []}
      />
    </AppShell>
  );
}
