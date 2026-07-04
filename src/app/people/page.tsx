import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { PeopleClient, type FriendRow, type RequestRow, type CircleRow } from './PeopleClient';

export const metadata: Metadata = { title: 'People' };

export default async function PeoplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { data: connections },
    { data: circles },
    { data: circleMembers },
    { data: householdRows },
  ] = await Promise.all([
    supabase
      .from('connections')
      .select(
        'id, status, requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle)',
      )
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase.from('circles').select('id, name, emoji').eq('owner_id', user.id).order('created_at'),
    supabase
      .from('circle_members')
      .select('circle_id, member_id'),
    supabase
      .from('households')
      .select('id, name, emoji, household_members(member_id)')
      .eq('owner_id', user.id),
  ]);

  const friends: FriendRow[] = [];
  const incoming: RequestRow[] = [];
  const outgoing: RequestRow[] = [];

  for (const connection of connections ?? []) {
    const isRequester = connection.requester_id === user.id;
    const otherRaw = isRequester ? connection.addressee : connection.requester;
    const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
    if (!other) continue;
    const row = {
      connectionId: connection.id,
      id: other.id,
      name: other.display_name,
      handle: other.handle ?? '',
    };
    if (connection.status === 'accepted') {
      friends.push({
        ...row,
        circleIds: (circleMembers ?? [])
          .filter((cm) => cm.member_id === other.id)
          .map((cm) => cm.circle_id),
      });
    } else if (isRequester) {
      outgoing.push(row);
    } else {
      incoming.push(row);
    }
  }

  const circleRows: CircleRow[] = (circles ?? []).map((circle) => ({
    id: circle.id,
    name: circle.name,
    emoji: circle.emoji,
    memberCount: (circleMembers ?? []).filter((cm) => cm.circle_id === circle.id).length,
  }));

  const households = (householdRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    memberCount: (row.household_members ?? []).length,
  }));

  return (
    <AppShell title="People">
      {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            emoji="☺"
            title="Your people live here"
            body="Connect with friends by their handle. Then circles, signals, and Mutual Mode all come alive."
          />
          <PeopleClient
            friends={friends}
            incoming={incoming}
            outgoing={outgoing}
            circles={circleRows}
            households={households}
          />
        </div>
      ) : (
        <PeopleClient
          friends={friends}
          incoming={incoming}
          outgoing={outgoing}
          circles={circleRows}
          households={households}
        />
      )}
    </AppShell>
  );
}
