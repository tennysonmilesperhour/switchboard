import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { MutualClient, type MutualFriend, type MyIntent, type MyMatch } from './MutualClient';

export const metadata: Metadata = { title: 'Mutual Mode' };

export default async function MutualPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: connections }, { data: intents }, { data: matches }] =
    await Promise.all([
      supabase
        .from('connections')
        .select(
          'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle)',
        )
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase
        .from('mutual_intents')
        .select('id, target_id, activity, kind, status')
        .eq('author_id', user.id)
        .eq('status', 'active')
        .eq('kind', 'down_to_connect'),
      supabase
        .from('matches')
        .select('id, user_a, user_b, activity, kind, room_id, created_at')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order('created_at', { ascending: false }),
    ]);

  const friends: MutualFriend[] = (connections ?? []).map((connection) => {
    const other =
      connection.requester_id === user.id
        ? connection.addressee
        : connection.requester;
    const profile = Array.isArray(other) ? other[0] : other;
    return { id: profile.id, name: profile.display_name, handle: profile.handle ?? '' };
  });
  const friendName = (id: string) =>
    friends.find((f) => f.id === id)?.name ?? 'Someone';

  const myIntents: MyIntent[] = (intents ?? []).map((intent) => ({
    id: intent.id,
    targetId: intent.target_id,
    targetName: friendName(intent.target_id),
    activity: intent.activity,
  }));

  const myMatches: MyMatch[] = (matches ?? []).map((match) => {
    const otherId = match.user_a === user.id ? match.user_b : match.user_a;
    return {
      id: match.id,
      otherId,
      otherName: friendName(otherId),
      activity: match.activity,
      roomId: match.room_id,
      createdAt: match.created_at,
    };
  });

  return (
    <AppShell title="Mutual">
      <MutualClient friends={friends} intents={myIntents} matches={myMatches} />
    </AppShell>
  );
}
