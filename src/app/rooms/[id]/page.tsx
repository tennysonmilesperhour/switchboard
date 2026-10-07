import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { aiEnabled } from '@/lib/ai/claude';
import { signRoomPhotos } from '@/lib/server/room-media';
import type { EventStatus } from '@/lib/types';
import { RoomClient, type RoomItemRow } from './RoomClient';
import type { RoomMemberInfo, RoomReadOnly } from './RoomHeader';
import { ROOM_PAGE_SIZE } from './room-messages';

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

/**
 * A plan in one of these states is over, and its room can be left (D20). The
 * same set `leave_room` checks, and the one the inbox files under Past.
 */
const ENDED_EVENT_STATUSES: ReadonlySet<string> = new Set<EventStatus>(['cancelled', 'past']);

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

  const [
    { data: members },
    { data: messageRows },
    { data: items },
    { data: expenses },
    { data: shares },
    { data: events },
    { data: readOnly },
  ] = await Promise.all([
    supabase
      .from('room_members')
      .select('member_id, muted, profile:profiles(display_name, handle, avatar_url)')
      .eq('room_id', id),
    // The newest page, not the oldest: ascending + limit returned the first
    // 200 ever sent, so a busy room opened on a months-old conversation. One
    // extra row says whether "Load earlier" has anything to load.
    supabase
      .from('messages')
      .select('id, sender_id, body, image_url, created_at')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(ROOM_PAGE_SIZE + 1),
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
    supabase
      .from('expense_shares')
      .select('expense_id, member_id, share_cents, settled_at')
      .eq('room_id', id),
    // A plan's room links back to its plan (G30). RLS decides whether this
    // member can see the plan; a room whose plan they can't see just has no link.
    supabase
      .from('events')
      .select('id, title, status')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.rpc('room_is_read_only', { p_room: id }),
  ]);

  const memberRows = members ?? [];
  const memberNames: Record<string, string> = {};
  const memberInfo: RoomMemberInfo[] = [];
  let muted = false;
  for (const member of memberRows) {
    const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    const name = profile?.display_name || 'Member';
    memberNames[member.member_id] = name;
    memberInfo.push({
      id: member.member_id,
      name,
      handle: profile?.handle ?? '',
      avatarUrl: profile?.avatar_url ?? null,
    });
    if (member.member_id === user.id) muted = Boolean(member.muted);
  }
  memberInfo.sort((a, b) =>
    a.id === user.id ? -1 : b.id === user.id ? 1 : a.name.localeCompare(b.name),
  );

  const rows = messageRows ?? [];
  const page = rows.slice(0, ROOM_PAGE_SIZE);

  // People who wrote here and have since left keep their name on what they said.
  const formerIds = [...new Set(page.map((row) => row.sender_id))].filter(
    (senderId) => !memberNames[senderId],
  );
  const { data: formerProfiles } = formerIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', formerIds)
    : { data: [] };
  const senderNames: Record<string, string> = { ...memberNames };
  for (const profile of formerProfiles ?? []) {
    senderNames[profile.id] = profile.display_name || 'Someone';
  }

  // Photos are private-bucket paths since G2: sign them here, after RLS has
  // already decided this viewer may read these rows (docs/SECURITY.md).
  const signed = await signRoomPhotos([
    ...page.map((row) => ({ key: `m:${row.id}`, ref: row.image_url, ownerId: row.sender_id })),
    ...(items ?? [])
      .filter((item) => item.kind === 'photo')
      .map((item) => ({ key: `i:${item.id}`, ref: item.url, ownerId: item.created_by })),
  ]);

  const initialMessages = page
    .map((row) => ({ ...row, image_src: signed.get(`m:${row.id}`) ?? null }))
    .reverse();

  // Whether the viewer is the one who blocked. They already know that, so the
  // room can say it plainly; anyone else is only told the room is read-only.
  const otherIds = memberInfo.map((member) => member.id).filter((memberId) => memberId !== user.id);
  let readOnlyState: RoomReadOnly = null;
  if (readOnly === true) {
    const { data: ownBlocks } = otherIds.length
      ? await supabase
          .from('profile_blocks')
          .select('blocked_id')
          .eq('blocker_id', user.id)
          .in('blocked_id', otherIds)
      : { data: [] };
    const blocked = (ownBlocks ?? []).map((row) => memberNames[row.blocked_id] ?? 'them');
    readOnlyState = { blockedByYou: blocked };
  }

  const event = events?.[0] ?? null;
  const canLeave =
    room.kind === 'match' ||
    room.kind === 'direct' ||
    (room.kind === 'event' && (!event || ENDED_EVENT_STATUSES.has(event.status)));

  // A conversation started from a status is with exactly one other person, and
  // the room offers to turn it into a plan with them.
  const peer =
    room.kind === 'direct' && otherIds.length === 1
      ? { id: otherIds[0], name: memberNames[otherIds[0]] ?? 'them' }
      : null;

  return (
    <AppShell title={peer?.name ?? room.title} back="/rooms">
      <RoomClient
        roomId={room.id}
        roomKind={room.kind}
        roomTitle={room.title}
        peer={peer}
        currentUserId={user.id}
        members={memberInfo}
        memberNames={senderNames}
        initialMessages={initialMessages}
        hasEarlier={rows.length > ROOM_PAGE_SIZE}
        items={(items ?? []).map((item) => ({
          ...item,
          kind: roomItemKind(item.kind),
          url: item.kind === 'photo' ? (signed.get(`i:${item.id}`) ?? null) : item.url,
        }))}
        expenses={expenses ?? []}
        shares={shares ?? []}
        muted={muted}
        readOnly={readOnlyState}
        plan={event ? { id: event.id, title: event.title } : null}
        canLeave={canLeave}
        smartFiling={aiEnabled()}
      />
    </AppShell>
  );
}
