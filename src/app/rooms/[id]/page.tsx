import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import {
  RoomClient,
  type RoomMessage,
  type RoomItemRow,
  type ExpenseRow,
} from './RoomClient';

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
      supabase
        .from('messages')
        .select('id, sender_id, body, image_url, created_at')
        .eq('room_id', id)
        .order('created_at', { ascending: true })
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
        initialMessages={(messages ?? []) as RoomMessage[]}
        items={(items ?? []) as RoomItemRow[]}
        expenses={(expenses ?? []) as ExpenseRow[]}
      />
    </AppShell>
  );
}
