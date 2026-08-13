import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { appInviteUrl } from '@/lib/links';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { FindableNudge } from '@/components/profile/FindableNudge';
import { loadFindability } from '@/lib/server/findability';
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
    { data: avoidRows },
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
    supabase.from('profile_avoids').select('avoided_id').eq('avoider_id', user.id),
  ]);

  const avoidedIds = new Set(
    (avoidRows ?? []).map((row) => row.avoided_id as string),
  );

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
        isAvoided: avoidedIds.has(other.id),
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

  // Built here, not in the client: the origin is a deployment fact, and
  // appInviteUrl() throws on a misconfigured one so the failure lands on the
  // server where someone can fix it (see src/lib/links.ts).
  const inviteUrl = appInviteUrl();

  // Whether the people who already have this person's email or phone can find
  // them. Rendered above the search that fails for exactly this reason.
  const findability = await loadFindability();

  return (
    <AppShell title="People">
      {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 ? (
        <div className="space-y-6">
          <FindableNudge state={findability} />
          <EmptyState
            emoji="☺"
            title="Your people live here"
            body="Connect by handle, email, phone, or selected contacts. Then circles, signals, and Mutual Mode all come alive."
          />
          <PeopleClient
            friends={friends}
            incoming={incoming}
            outgoing={outgoing}
            circles={circleRows}
            households={households}
            inviteUrl={inviteUrl}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <FindableNudge state={findability} />
          <PeopleClient
            friends={friends}
            incoming={incoming}
            outgoing={outgoing}
            circles={circleRows}
            households={households}
            inviteUrl={inviteUrl}
          />
        </div>
      )}
    </AppShell>
  );
}
