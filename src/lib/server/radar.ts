import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export interface RadarSuggestion {
  friendId: string;
  friendName: string;
  daysSince: number | null; // null = never hung out
  lastActivity: string | null;
}

const STALE_DAYS = 60;
const MS_PER_DAY = 86_400_000;

/**
 * Reconnection Radar: friends you haven't shared anything with in a while.
 * Strictly private to the viewer; computed server-side, never shown to the
 * other person.
 *
 * Nobody the viewer gives space to is ever suggested (G8). "You haven't seen
 * them in a while — make a plan?" about a person you asked for space from is
 * the one nudge Give Space exists to prevent. The list is read through the
 * viewer's own client, where `profile_avoids` RLS returns only their own rows;
 * it only ever narrows what this viewer is shown, and says nothing about anyone.
 */
export async function getReconnectionSuggestions(
  userId: string,
  limit = 2,
  viewerClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<RadarSuggestion[]> {
  const admin = createAdminClient();
  const viewer = viewerClient ?? (await createClient());
  const { data: avoidRows, error: avoidError } = await viewer
    .from('profile_avoids')
    .select('avoided_id')
    .eq('avoider_id', userId);
  // Fail closed: without the list, a suggestion could name someone the viewer
  // asked for space from, so suggest nobody this time.
  if (avoidError) return [];
  const givingSpace = new Set((avoidRows ?? []).map((row) => row.avoided_id));

  const { data: connections } = await admin
    .from('connections')
    .select(
      'created_at, requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, sabbatical), addressee:profiles!connections_addressee_id_fkey(id, display_name, sabbatical)',
    )
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (!connections || connections.length === 0) return [];

  const friends = connections
    .map((connection) => {
      const otherRaw =
        connection.requester_id === userId ? connection.addressee : connection.requester;
      const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
      return {
        id: other.id as string,
        name: other.display_name as string,
        connectedAt: connection.created_at as string,
        // Don't nudge someone who's asked for a quiet season.
        sabbatical: Boolean(other.sabbatical),
      };
    })
    .filter((friend) => !friend.sabbatical)
    .filter((friend) => !givingSpace.has(friend.id));
  if (friends.length === 0) return [];
  const friendIds = friends.map((f) => f.id);

  // My events (hosted or accepted).
  const [{ data: myInvites }, { data: myHosted }] = await Promise.all([
    admin
      .from('invites')
      .select('event_id')
      .eq('invitee_id', userId)
      .eq('status', 'accepted'),
    admin.from('events').select('id, host_id, starts_at').eq('host_id', userId),
  ]);
  const myEventIds = [
    ...(myInvites ?? []).map((i) => i.event_id),
    ...(myHosted ?? []).map((e) => e.id),
  ];

  // Friends who shared those events (as attendee or host).
  const lastSeen = new Map<string, number>();
  if (myEventIds.length > 0) {
    const [{ data: sharedInvites }, { data: sharedEvents }] = await Promise.all([
      admin
        .from('invites')
        .select('invitee_id, event:events(starts_at, created_at)')
        .in('event_id', myEventIds)
        .in('invitee_id', friendIds)
        .eq('status', 'accepted'),
      admin
        .from('events')
        .select('host_id, starts_at, created_at')
        .in('id', myEventIds)
        .in('host_id', friendIds),
    ]);
    for (const row of sharedInvites ?? []) {
      if (!row.invitee_id) continue;
      const event = Array.isArray(row.event) ? row.event[0] : row.event;
      const when = new Date(event?.starts_at ?? event?.created_at ?? 0).getTime();
      const prev = lastSeen.get(row.invitee_id) ?? 0;
      if (when > prev) lastSeen.set(row.invitee_id, when);
    }
    for (const row of sharedEvents ?? []) {
      const when = new Date(row.starts_at ?? row.created_at).getTime();
      const prev = lastSeen.get(row.host_id) ?? 0;
      if (when > prev) lastSeen.set(row.host_id, when);
    }
  }

  // Mutual matches also count as contact.
  const { data: matches } = await admin
    .from('matches')
    .select('user_a, user_b, created_at')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  for (const match of matches ?? []) {
    const other = match.user_a === userId ? match.user_b : match.user_a;
    const when = new Date(match.created_at).getTime();
    if (when > (lastSeen.get(other) ?? 0)) lastSeen.set(other, when);
  }

  const now = Date.now();
  return friends
    .map((friend) => {
      const last = lastSeen.get(friend.id) ?? null;
      const anchor = last ?? new Date(friend.connectedAt).getTime();
      return {
        friendId: friend.id,
        friendName: friend.name,
        daysSince: last ? Math.floor((now - last) / MS_PER_DAY) : null,
        lastActivity: last ? new Date(last).toISOString() : null,
        staleness: now - anchor,
      };
    })
    .filter((s) => s.staleness > STALE_DAYS * MS_PER_DAY)
    .sort((a, b) => b.staleness - a.staleness)
    .slice(0, limit)
    .map(({ friendId, friendName, daysSince, lastActivity }) => ({
      friendId,
      friendName,
      daysSince,
      lastActivity,
    }));
}
