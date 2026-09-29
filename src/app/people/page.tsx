import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { appInviteUrl } from '@/lib/links';
import { AppShell } from '@/components/shell/AppShell';
import { FindableNudge } from '@/components/profile/FindableNudge';
import { loadFindability } from '@/lib/server/findability';
import { PeopleClient } from './PeopleClient';
import type { CircleRow, FriendRow, RequestRow, SpaceRow } from './sections/types';
import { loadVisibleSignals } from '@/lib/server/signals';

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
    (avoidRows ?? []).map((row) => row.avoided_id),
  );

  // Everyone on the viewer's Give Space list, friend or not (G35). The ids came
  // from the viewer's own RLS-scoped rows; only public profile fields are read.
  const { data: avoidedProfiles } = avoidedIds.size
    ? await supabase
        .from('profiles')
        .select('id, display_name, handle')
        .in('id', [...avoidedIds])
    : { data: [] };
  const givingSpace: SpaceRow[] = (avoidedProfiles ?? [])
    .map((profile) => ({
      id: profile.id,
      name: profile.display_name || 'Someone',
      handle: profile.handle ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

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

  // Who is up for something right now. Loaded after the friend list because it
  // is keyed by their ids, and through the viewer's own client so the audience
  // rule stays in the `signals_visible` policy.
  const signals = await loadVisibleSignals(
    supabase,
    friends.map((friend) => friend.id),
  );
  for (const friend of friends) {
    friend.signal = signals[friend.id] ?? null;
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
    memberIds: (row.household_members ?? []).map((member) => member.member_id),
  }));

  // Built here, not in the client: the origin is a deployment fact, and
  // appInviteUrl() throws on a misconfigured one so the failure lands on the
  // server where someone can fix it (see src/lib/links.ts).
  const inviteUrl = appInviteUrl();

  // Whether the people who already have this person's email or phone can find
  // them. Rendered above the search that fails for exactly this reason.
  const findability = await loadFindability();

  // Alphabetical, so a long list is scannable. The query has no order of its
  // own, which left friends in whatever order the rows happened to come back.
  friends.sort((a, b) => a.name.localeCompare(b.name));

  // PeopleClient renders its own "Your people live here" empty state; this page
  // used to render a second copy of it above the form whenever the list was
  // empty, so a brand-new account saw the same card twice.
  return (
    <AppShell title="People">
      <div className="space-y-6">
        <FindableNudge state={findability} />
        <PeopleClient
          friends={friends}
          incoming={incoming}
          outgoing={outgoing}
          circles={circleRows}
          households={households}
          givingSpace={givingSpace}
          inviteUrl={inviteUrl}
        />
      </div>
    </AppShell>
  );
}
