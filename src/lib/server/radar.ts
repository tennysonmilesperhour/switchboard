import { createAdminClient } from '@/lib/supabase/admin';

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
 */
export async function getReconnectionSuggestions(
  userId: string,
  limit = 2,
): Promise<RadarSuggestion[]> {
  const admin = createAdminClient();

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
    .filter((friend) => !friend.sabbatical);
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
