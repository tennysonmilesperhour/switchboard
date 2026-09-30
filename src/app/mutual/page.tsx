import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { localDate, ritualIsDue } from '@/lib/rituals';
import { MutualClient, type MutualFriend, type MyIntent, type MyMatch, type RitualRow } from './MutualClient';

export const metadata: Metadata = { title: 'Mutual' };

export default async function MutualPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const { person } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: me }, { data: connections }, { data: intents }, { data: matches }, { data: ritualRows }] =
    await Promise.all([
      supabase.from('profiles').select('timezone, sabbatical').eq('id', user.id).maybeSingle(),
      supabase
        .from('connections')
        .select(
          'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle, sabbatical), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle, sabbatical)',
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
      supabase
        .from('rituals')
        .select('id, activity, cadence_days, status, due_on, creator_id, partner_id')
        .or(`creator_id.eq.${user.id},partner_id.eq.${user.id}`)
        .in('status', ['proposed', 'active', 'paused']),
    ]);

  // Someone on sabbatical is not offered for Mutual or a new ritual (D6).
  const onSabbatical = Boolean(me?.sabbatical);
  const away = new Set<string>();
  const connected: MutualFriend[] = (connections ?? []).map((connection) => {
    const other =
      connection.requester_id === user.id
        ? connection.addressee
        : connection.requester;
    const profile = Array.isArray(other) ? other[0] : other;
    if (profile.sabbatical) away.add(profile.id);
    return { id: profile.id, name: profile.display_name, handle: profile.handle ?? '' };
  });
  const friends = connected.filter((friend) => !away.has(friend.id));
  // A match is not always with a connection: a matchmaker intro pairs two
  // people who were never connected, and Discover matches strangers by
  // design. Naming only from the friend list showed every one of those as
  // "Someone" on the one page that exists to list your matches.
  const otherIds = new Set<string>();
  for (const match of matches ?? []) {
    otherIds.add(match.user_a === user.id ? match.user_b : match.user_a);
  }
  for (const ritual of ritualRows ?? []) {
    otherIds.add(ritual.creator_id === user.id ? ritual.partner_id : ritual.creator_id);
  }
  const unknownIds = [...otherIds].filter((id) => !connected.some((f) => f.id === id));
  const { data: others } = unknownIds.length
    ? await supabase.from('profiles').select('id, display_name, sabbatical').in('id', unknownIds)
    : { data: [] };
  for (const row of others ?? []) if (row.sabbatical) away.add(row.id);
  const names = new Map<string, string>([
    ...(others ?? []).map((row): [string, string] => [row.id, row.display_name]),
    ...connected.map((f): [string, string] => [f.id, f.name]),
  ]);
  const friendName = (id: string) => names.get(id) || 'Someone';

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

  const today = localDate(me?.timezone);
  const rituals: RitualRow[] = (ritualRows ?? []).map((row) => {
    const isMine = row.creator_id === user.id;
    const otherId = isMine ? row.partner_id : row.creator_id;
    // A ritual with someone on sabbatical is on hold: no reminders (the
    // cron's claim skips it) and no nudge here to plan or skip it.
    const heldBy = onSabbatical ? 'you' : away.has(otherId) ? friendName(otherId) : null;
    return {
      id: row.id,
      activity: row.activity,
      cadenceDays: row.cadence_days,
      status: row.status,
      isMine,
      otherId,
      otherName: friendName(otherId),
      dueOn: row.due_on,
      due: !heldBy && ritualIsDue(row, today),
      today,
      heldBy,
    };
  });

  return (
    <AppShell title="Mutual">
      <MutualClient
        currentUserId={user.id}
        friends={friends}
        intents={myIntents}
        matches={myMatches}
        rituals={rituals}
        onSabbatical={onSabbatical}
        initialPersonId={person ?? null}
      />
    </AppShell>
  );
}
