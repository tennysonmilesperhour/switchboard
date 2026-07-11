/**
 * Behavioral identity — server-side gathering + caching.
 *
 * Reads only rows the owner can already see under RLS, derives plain primitives
 * (local hours, response minutes, counts), runs the pure engine, and caches the
 * result in `identity_facets`. The portrait never leaves the owner except
 * through the consented `shared_facets_of()` path (see the migration).
 */

import { createClient } from '@/lib/supabase/server';
import {
  computeFacets,
  type Facet,
  type EnergySample,
  type TempoSample,
  type Feeling,
} from '@/lib/engine/identity';

export interface FacetPref {
  hidden: boolean;
  sharedWithConnections: boolean;
}

export interface DisplayFacet extends Facet, FacetPref {}

/** Local hour 0–23 of an ISO instant in the given IANA zone; null on bad input. */
function localHour(iso: string | null, timeZone: string): number | null {
  if (!iso) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone,
    }).formatToParts(new Date(iso));
    const raw = parts.find((p) => p.type === 'hour')?.value;
    if (raw === undefined) return null;
    return Number(raw) % 24; // some platforms render midnight as "24".
  } catch {
    return null;
  }
}

/**
 * Supabase renders a to-one join as an object or a 1-element array (and its
 * generated types often say array); normalize either shape to a single row.
 */
function one<T>(rel: unknown): T | null {
  if (Array.isArray(rel)) return (rel[0] as T) ?? null;
  return (rel as T) ?? null;
}

/**
 * Recompute the caller's facets from their own behavioral rows, refresh the
 * cache, and return them annotated with the owner's per-facet preferences.
 */
export async function loadMyIdentity(): Promise<DisplayFacet[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [
    { data: profile },
    { data: energyRows },
    { data: inviteRows },
    { data: hostedRows },
    { data: boardRows },
    { data: postRows },
    { data: ritualRows },
    { count: circlesOwned },
    { data: matchRows },
    { data: prefRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('interests, down_to, timezone')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('energy_logs')
      .select('feeling, event_id, event:events(starts_at, host_id)')
      .eq('user_id', user.id),
    supabase
      .from('invites')
      .select('status, sent_at, responded_at, event:events(title, starts_at)')
      .eq('invitee_id', user.id),
    supabase.from('events').select('id, title').eq('host_id', user.id),
    supabase.from('board_members').select('board:boards(id, name)').eq('member_id', user.id),
    supabase.from('board_posts').select('board_id').eq('author_id', user.id),
    supabase
      .from('rituals')
      .select('id')
      .eq('status', 'active')
      .or(`creator_id.eq.${user.id},partner_id.eq.${user.id}`),
    supabase
      .from('circles')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id),
    supabase
      .from('matches')
      .select('activity')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
    supabase.from('facet_prefs').select('facet_key, hidden, shared_with_connections'),
  ]);

  const timeZone = profile?.timezone || 'UTC';

  // Headcount is only knowable for events the owner hosted (RLS hides other
  // hosts' invite lists), so size is best-effort; the engine tolerates null.
  const hostedIds = new Set((hostedRows ?? []).map((e) => e.id as string));
  const acceptedByEvent = new Map<string, number>();
  const { data: hostedAccepted } = hostedIds.size
    ? await supabase
        .from('invites')
        .select('event_id')
        .in('event_id', [...hostedIds])
        .eq('status', 'accepted')
    : { data: [] as { event_id: string }[] };
  for (const row of hostedAccepted ?? []) {
    acceptedByEvent.set(row.event_id, (acceptedByEvent.get(row.event_id) ?? 0) + 1);
  }

  const energy: EnergySample[] = (energyRows ?? []).map((row) => {
    const ev = one<{ starts_at: string | null; host_id: string }>(row.event);
    const eventId = row.event_id as string;
    const isHost = ev?.host_id === user.id;
    const size = isHost ? (acceptedByEvent.get(eventId) ?? 0) + 1 : null;
    return {
      feeling: row.feeling as Feeling,
      hour: localHour(ev?.starts_at ?? null, timeZone),
      size,
    };
  });

  const tempo: TempoSample[] = [];
  let invitesAccepted = 0;
  let invitesResolved = 0;
  const attendedTitles: string[] = [];
  for (const inv of inviteRows ?? []) {
    const status = inv.status as string;
    const ev = one<{ title: string | null; starts_at: string | null }>(inv.event);
    if (status === 'accepted' || status === 'declined' || status === 'expired') {
      invitesResolved += 1;
    }
    if (status === 'accepted') {
      invitesAccepted += 1;
      if (ev?.title) attendedTitles.push(ev.title);
    }
    if (status === 'accepted' || status === 'declined') {
      const sent = inv.sent_at ? Date.parse(inv.sent_at as string) : NaN;
      const resp = inv.responded_at ? Date.parse(inv.responded_at as string) : NaN;
      const responseMinutes =
        Number.isFinite(sent) && Number.isFinite(resp) ? (resp - sent) / 60000 : null;
      const start = ev?.starts_at ? Date.parse(ev.starts_at) : NaN;
      const leadHours =
        status === 'accepted' && Number.isFinite(resp) && Number.isFinite(start)
          ? (start - resp) / 3600000
          : null;
      tempo.push({ responseMinutes, leadHours });
    }
  }

  const postCounts = new Map<string, number>();
  for (const p of postRows ?? []) {
    const bid = p.board_id as string;
    postCounts.set(bid, (postCounts.get(bid) ?? 0) + 1);
  }
  const boards = (boardRows ?? []).map((row) => {
    const b = one<{ id: string; name: string }>(row.board);
    return { name: b?.name ?? 'a board', posts: postCounts.get(b?.id ?? '') ?? 0 };
  });

  const professed = [
    ...((profile?.down_to as string[] | null) ?? []),
    ...((profile?.interests as string[] | null) ?? []),
  ];
  const evidence = [
    ...attendedTitles,
    ...(hostedRows ?? []).map((e) => e.title as string),
    ...(matchRows ?? []).map((m) => m.activity as string),
  ];

  const facets = computeFacets({
    energy,
    tempo,
    circles: {
      boards,
      ritualsActive: (ritualRows ?? []).length,
      circlesOwned: circlesOwned ?? 0,
      invitesAccepted,
      invitesResolved,
    },
    interests: { professed, evidence },
  });

  // Refresh the cache: full replace is safe because prefs live separately.
  await supabase.from('identity_facets').delete().eq('user_id', user.id);
  if (facets.length > 0) {
    await supabase.from('identity_facets').insert(
      facets.map((f) => ({
        user_id: user.id,
        facet_key: f.key,
        title: f.title,
        summary: f.summary,
        detail: f.detail,
        confidence: f.confidence,
        sample_size: f.sampleSize,
      })),
    );
  }

  const prefs = new Map<string, FacetPref>();
  for (const p of prefRows ?? []) {
    prefs.set(p.facet_key as string, {
      hidden: Boolean(p.hidden),
      sharedWithConnections: Boolean(p.shared_with_connections),
    });
  }

  return facets.map((f) => ({
    ...f,
    hidden: prefs.get(f.key)?.hidden ?? false,
    sharedWithConnections: prefs.get(f.key)?.sharedWithConnections ?? false,
  }));
}

export interface SharedFacet {
  facet_key: string;
  title: string;
  summary: string;
  confidence: string;
  computed_at: string;
}

/** Facets another user has consented to share with their connections. */
export async function loadSharedFacets(targetId: string): Promise<SharedFacet[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('shared_facets_of', { p_target: targetId });
  return (data as SharedFacet[] | null) ?? [];
}
