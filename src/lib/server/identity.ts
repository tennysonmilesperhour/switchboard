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
import { toJson } from '@/lib/supabase/json';
import type { Database, Tables } from '@/lib/supabase/database.types';

export type Verdict = 'confirmed' | 'rejected' | null;

export interface FacetPref {
  hidden: boolean;
  sharedWithConnections: boolean;
  verdict: Verdict;
}

export interface DisplayFacet extends Facet, FacetPref {}

const FEELING_VALUE: Record<Feeling, number> = { filled: 1, neutral: 0, drained: -1 };
const DAY_MS = 86_400_000;

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

function feeling(value: string): Feeling {
  return value === 'filled' || value === 'drained' ? value : 'neutral';
}

function verdict(value: string | null): Verdict {
  return value === 'confirmed' || value === 'rejected' ? value : null;
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
    { data: settingRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('interests, down_to, timezone, quiet_hours_start')
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
    supabase.from('facet_prefs').select('facet_key, hidden, shared_with_connections, verdict'),
    supabase.from('operator_settings').select('setting_key, enabled'),
  ]);

  const enabledFeatures = new Set(
    (settingRows ?? [])
      .filter((s) => s.enabled)
      .map((s) => s.setting_key),
  );

  const timeZone = profile?.timezone || 'UTC';
  const now = Date.now();

  // Headcount is only knowable for events the owner hosted (RLS hides other
  // hosts' invite lists), so size is best-effort; the engine tolerates null.
  const hostedIds = new Set((hostedRows ?? []).map((e) => e.id));
  const acceptedByEvent = new Map<string, number>();
  let hostedAccepted: Array<{ event_id: string }> = [];
  if (hostedIds.size > 0) {
    const { data } = await supabase
      .from('invites')
      .select('event_id')
      .in('event_id', [...hostedIds])
      .eq('status', 'accepted');
    hostedAccepted = data ?? [];
  }
  for (const row of hostedAccepted) {
    acceptedByEvent.set(row.event_id, (acceptedByEvent.get(row.event_id) ?? 0) + 1);
  }

  const energy: EnergySample[] = (energyRows ?? []).map((row) => {
    const ev = Array.isArray(row.event) ? row.event[0] : row.event;
    const eventId = row.event_id;
    const isHost = ev?.host_id === user.id;
    const size = isHost ? (acceptedByEvent.get(eventId) ?? 0) + 1 : null;
    return {
      feeling: feeling(row.feeling),
      hour: localHour(ev?.starts_at ?? null, timeZone),
      size,
    };
  });

  const tempo: TempoSample[] = [];
  let invitesAccepted = 0;
  let invitesResolved = 0;
  const attendedTitles: string[] = [];
  // Seasons: yeses in the last 30 days vs. the 30 before that.
  let recentAccepts = 0;
  let earlierAccepts = 0;
  // Divergence: histogram of the local hour of the plans you actually accept.
  const acceptedHourCounts = { daytime: 0, evening: 0, 'late night': 0 };
  for (const inv of inviteRows ?? []) {
    const status = inv.status;
    const ev = Array.isArray(inv.event) ? inv.event[0] : inv.event;
    if (status === 'accepted' || status === 'declined' || status === 'expired') {
      invitesResolved += 1;
    }
    if (status === 'accepted') {
      invitesAccepted += 1;
      if (ev?.title) attendedTitles.push(ev.title);
      const resp = inv.responded_at ? Date.parse(inv.responded_at) : NaN;
      if (Number.isFinite(resp)) {
        const ageDays = (now - resp) / DAY_MS;
        if (ageDays <= 30) recentAccepts += 1;
        else if (ageDays <= 60) earlierAccepts += 1;
      }
      const h = localHour(ev?.starts_at ?? null, timeZone);
      if (h !== null) {
        const label = h >= 5 && h < 17 ? 'daytime' : h >= 17 && h < 22 ? 'evening' : 'late night';
        acceptedHourCounts[label] += 1;
      }
    }
    if (status === 'accepted' || status === 'declined') {
      const sent = inv.sent_at ? Date.parse(inv.sent_at) : NaN;
      const resp = inv.responded_at ? Date.parse(inv.responded_at) : NaN;
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
    const bid = p.board_id;
    postCounts.set(bid, (postCounts.get(bid) ?? 0) + 1);
  }
  const boards = (boardRows ?? []).map((row) => {
    const b = Array.isArray(row.board) ? row.board[0] : row.board;
    return { name: b?.name ?? 'a board', posts: postCounts.get(b?.id ?? '') ?? 0 };
  });

  const professed = [
    ...(profile?.down_to ?? []),
    ...(profile?.interests ?? []),
  ];
  const evidence = [
    ...attendedTitles,
    ...(hostedRows ?? []).map((e) => e.title),
    ...(matchRows ?? []).map((m) => m.activity),
  ];

  // Contexts (#3): average feeling in intimate rooms vs. crowds, by size.
  const solo = { sum: 0, n: 0 };
  const group = { sum: 0, n: 0 };
  for (const s of energy) {
    if (s.size === null) continue;
    if (s.size <= 3) {
      solo.sum += FEELING_VALUE[s.feeling];
      solo.n += 1;
    } else if (s.size >= 6) {
      group.sum += FEELING_VALUE[s.feeling];
      group.n += 1;
    }
  }

  // Divergence (#1): declared chronotype (from quiet-hours) vs. the time of day
  // you actually accept plans. Only a clear contradiction becomes a claim.
  const qhStart = profile?.quiet_hours_start;
  const declaredChronotype =
    qhStart === null || qhStart === undefined
      ? null
      : // Quiet from late evening through the small hours ⇒ up late.
      qhStart >= 22 || qhStart <= 4
      ? 'a night owl'
      : // Quiet from early evening (6–9pm) ⇒ early to bed. The 10am–5pm band is
      // ambiguous (quiet hours set for work, not sleep), so claim nothing.
      qhStart >= 18 && qhStart <= 21
      ? 'an early night'
      : null;
  const revealedTime = (['daytime', 'evening', 'late night'] as const)
    .map((key) => [key, acceptedHourCounts[key]] as const)
    .sort((a, b) => b[1] - a[1])[0];
  const revealedChronotype =
    revealedTime && revealedTime[1] > 0 ? revealedTime[0] : null;
  const chronotypeContradicts =
    (declaredChronotype === 'a night owl' && revealedChronotype === 'daytime') ||
    (declaredChronotype === 'an early night' && revealedChronotype === 'late night');
  const divergenceClaims = chronotypeContradicts
    ? [
        {
          label: 'yeses',
          declared: declaredChronotype!,
          revealed: revealedChronotype!,
        },
      ]
    : [];

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
    divergence: { claims: divergenceClaims },
    seasons: {
      recentAccepts,
      earlierAccepts,
      recentDrainedShare: null,
      earlierDrainedShare: null,
      windowLabel: 'month',
    },
    contexts: {
      soloAvg: solo.n > 0 ? solo.sum / solo.n : null,
      soloN: solo.n,
      groupAvg: group.n > 0 ? group.sum / group.n : null,
      groupN: group.n,
    },
    enabledFeatures,
  });

  // Refresh the cache by upserting the fresh rows, then pruning only the keys
  // that no longer exist. Upsert-then-prune (rather than delete-then-insert)
  // means a failed write never leaves the portrait blank. Prefs live separately.
  const freshKeys = facets.map((f) => f.key);
  if (facets.length > 0) {
    const { error: upsertError } = await supabase.from('identity_facets').upsert(
      facets.map((f) => ({
        user_id: user.id,
        facet_key: f.key,
        title: f.title,
        summary: f.summary,
        detail: toJson(f.detail),
        confidence: f.confidence,
        sample_size: f.sampleSize,
        computed_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,facet_key' },
    );
    if (!upsertError) {
      await supabase
        .from('identity_facets')
        .delete()
        .eq('user_id', user.id)
        .not('facet_key', 'in', `(${freshKeys.join(',')})`);
    }
  } else {
    // No facets this pass — clear any stale cache.
    await supabase.from('identity_facets').delete().eq('user_id', user.id);
  }

  const prefs = new Map<string, FacetPref>();
  for (const p of prefRows ?? []) {
    prefs.set(p.facet_key, {
      hidden: Boolean(p.hidden),
      sharedWithConnections: Boolean(p.shared_with_connections),
      verdict: verdict(p.verdict),
    });
  }

  return facets.map((f) => ({
    ...f,
    hidden: prefs.get(f.key)?.hidden ?? false,
    sharedWithConnections: prefs.get(f.key)?.sharedWithConnections ?? false,
    verdict: prefs.get(f.key)?.verdict ?? null,
  }));
}

/** The caller's operator settings, defaulted so every known key has a value. */
export async function loadOperatorSettings(): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase.from('operator_settings').select('setting_key, enabled');
  const out: Record<string, boolean> = {};
  for (const row of data ?? []) out[row.setting_key] = Boolean(row.enabled);
  return out;
}

/**
 * Whether the caller has enough behavioral history for a worthwhile reflection.
 * Counts only facets the user hasn't set aside — rejected or hidden — the exact
 * set requestReflection reflects over, so the button never appears for a
 * reflection that would then be refused.
 */
export async function reflectionReady(): Promise<boolean> {
  const supabase = await createClient();
  const [{ data: facetRows }, { data: prefRows }] = await Promise.all([
    supabase.from('identity_facets').select('facet_key'),
    supabase.from('facet_prefs').select('facet_key, verdict, hidden'),
  ]);
  const setAside = new Set(
    (prefRows ?? [])
      .filter((p) => p.verdict === 'rejected' || p.hidden === true)
      .map((p) => p.facet_key),
  );
  const usable = (facetRows ?? []).filter(
    (f) => !setAside.has(f.facet_key),
  );
  return usable.length >= 3;
}

export type Reflection = Pick<
  Tables<'identity_reflections'>,
  'id' | 'kind' | 'body' | 'source' | 'created_at'
>;

/** The caller's saved reflections, newest first. */
export async function loadReflections(): Promise<Reflection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('identity_reflections')
    .select('id, kind, body, source, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  return data ?? [];
}

export type SharedFacet =
  Database['public']['Functions']['shared_facets_of']['Returns'][number];

/** Facets another user has consented to share with their connections. */
export async function loadSharedFacets(targetId: string): Promise<SharedFacet[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('shared_facets_of', { p_target: targetId });
  return data ?? [];
}

export type Compatibility =
  Database['public']['Functions']['compatibility_between']['Returns'][number];

/**
 * A consented compatibility read between the caller and `targetId`. Non-null
 * only when both are connected and both turned on 'facet_compatibility'; the
 * database computes it from both users' facets and returns only the summary.
 */
export async function loadCompatibility(targetId: string): Promise<Compatibility | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('compatibility_between', { p_other: targetId });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.summary) return null;
  return { summary: row.summary, basis: row.basis };
}
