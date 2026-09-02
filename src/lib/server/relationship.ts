import type { createClient } from '@/lib/supabase/server';
import type { createAdminClient } from '@/lib/supabase/admin';

/** Where the viewer stands with another person, from the viewer's side. */
export type RelationshipStatus =
  | 'self'
  | 'none'
  | 'incoming'
  | 'outgoing'
  | 'accepted';

export interface Relationship {
  status: RelationshipStatus;
  /** Present for pending/accepted rows so the UI can accept/remove directly. */
  connectionId: string | null;
}

export interface MutualConnections {
  count: number;
  /** A few names to show ("Ana, Ben and 3 others"). */
  names: string[];
}

/** PostgREST `.or()` filters below are built by string interpolation; only ever
 *  feed them DB-issued UUIDs (mirrors the guard in actions/connections.ts). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The viewer's connection standing with `targetId`. Reads through the caller's
 * RLS client — connections_select is participants-only, so this only ever sees
 * rows the viewer is part of.
 */
export async function getRelationship(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
  targetId: string,
): Promise<Relationship> {
  if (targetId === viewerId) return { status: 'self', connectionId: null };
  if (!UUID_RE.test(viewerId) || !UUID_RE.test(targetId)) {
    return { status: 'none', connectionId: null };
  }
  const { data } = await supabase
    .from('connections')
    .select('id, requester_id, status')
    .or(
      `and(requester_id.eq.${viewerId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${viewerId})`,
    )
    .maybeSingle();
  if (!data) return { status: 'none', connectionId: null };
  if (data.status === 'accepted') {
    return { status: 'accepted', connectionId: data.id };
  }
  return {
    status: data.requester_id === viewerId ? 'outgoing' : 'incoming',
    connectionId: data.id,
  };
}

/**
 * Friends the viewer and `targetId` have in common. A viewer can only read
 * their own connections through RLS, so the target's side is read with the
 * admin client — pass one in from a caller that already has it. Returns an
 * empty result when admin credentials are unavailable.
 */
export async function getMutualConnections(
  admin: ReturnType<typeof createAdminClient>,
  viewerId: string,
  targetId: string,
  limit = 3,
): Promise<MutualConnections> {
  if (viewerId === targetId) return { count: 0, names: [] };
  if (!UUID_RE.test(viewerId) || !UUID_RE.test(targetId)) {
    return { count: 0, names: [] };
  }

  const acceptedPartners = async (userId: string): Promise<Set<string>> => {
    const { data } = await admin
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const ids = new Set<string>();
    for (const row of data ?? []) {
      const other =
        row.requester_id === userId ? row.addressee_id : row.requester_id;
      if (other) ids.add(other as string);
    }
    return ids;
  };

  const [mine, theirs] = await Promise.all([
    acceptedPartners(viewerId),
    acceptedPartners(targetId),
  ]);
  const mutualIds = [...mine].filter(
    (id) => theirs.has(id) && id !== viewerId && id !== targetId,
  );
  if (mutualIds.length === 0) return { count: 0, names: [] };

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('id', mutualIds.slice(0, limit));
  const names = (profiles ?? []).map(
    (p) => (p.display_name as string) || 'Someone',
  );
  return { count: mutualIds.length, names };
}

/** Human phrasing of a mutual-friends result, or null when there are none. */
export function describeMutuals({ count, names }: MutualConnections): string | null {
  if (count <= 0) return null;
  const shown = names.map((n) => n.split(' ')[0]);
  if (count <= shown.length) {
    if (count === 1) return `${shown[0]} in common`;
    if (count === 2) return `${shown[0]} & ${shown[1]} in common`;
    return `${shown.slice(0, -1).join(', ')} & ${shown[shown.length - 1]} in common`;
  }
  const remaining = count - shown.length;
  const lead = shown.length > 0 ? `${shown.join(', ')} & ` : '';
  return `${lead}${remaining} other${remaining === 1 ? '' : 's'} in common`;
}
