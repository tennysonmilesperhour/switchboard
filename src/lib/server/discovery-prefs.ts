import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  DEFAULT_BAR,
  DEFAULT_WEIGHT,
  SELVES,
  isAudience,
  isGender,
  itemKey,
  type ActiveMood,
  type Audience,
  type Gender,
  type SignalRow,
  type Self,
} from '@/lib/discovery-lanes';

export interface LaneState {
  enabled: boolean;
  bar: number;
  visible_to: Audience;
  seeking: Audience;
  blurb: string;
  identifies_as: Gender | null;
  interested_in: Gender[];
}

export interface PrefItem {
  key: string;
  label: string;
  group: 'Interests' | 'Down to' | 'School' | 'Work';
  /** What the database uses for this person when they have not rated it. */
  defaultWeight: number;
}

export interface DiscoveryPrefs {
  discoverable: boolean;
  lanes: Record<Self, LaneState>;
  weights: Record<Self, Record<string, number>>;
  items: PrefItem[];
  mood: ActiveMood | null;
  signals: Record<Self, SignalRow[]>;
}

type Client = SupabaseClient<Database>;

function emptyLane(self: Self, discoverable: boolean): LaneState {
  // Mirrors `private.discovery_effective_self`: no row means "friends" follows
  // the discoverable switch with no bar, and the other lanes are off.
  return {
    enabled: self === 'friends' ? discoverable : false,
    bar: self === 'friends' ? 0 : DEFAULT_BAR,
    visible_to: 'anyone',
    seeking: 'anyone',
    blurb: '',
    identifies_as: null,
    interested_in: [],
  };
}

/** Everything the preferences screen shows, read through the caller's own RLS. */
export async function loadDiscoveryPrefs(supabase: Client, userId: string): Promise<DiscoveryPrefs> {
  const [profile, selves, weights, mood, signals, facts] = await Promise.all([
    supabase.from('profiles').select('discoverable, interests, down_to').eq('id', userId).single(),
    supabase.from('discovery_selves').select('*').eq('user_id', userId),
    supabase.from('discovery_weights').select('self, item, weight').eq('user_id', userId),
    supabase
      .from('discovery_mood')
      .select('preset, bar_shift, only_selves, include_items, expires_at')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    supabase
      .from('discovery_signals')
      .select('self, kind, items')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('profile_facts')
      .select('kind, label, org_key, tier')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  for (const result of [profile, selves, weights, mood, signals, facts]) {
    if (result.error) throw result.error;
  }

  const discoverable = Boolean(profile.data?.discoverable);
  const lanes = Object.fromEntries(SELVES.map((self) => [self, emptyLane(self, discoverable)])) as Record<Self, LaneState>;
  for (const row of selves.data ?? []) {
    if (!(SELVES as readonly string[]).includes(row.self)) continue;
    lanes[row.self as Self] = {
      enabled: row.enabled,
      bar: row.bar,
      visible_to: isAudience(row.visible_to) ? row.visible_to : 'anyone',
      seeking: isAudience(row.seeking) ? row.seeking : 'anyone',
      blurb: row.blurb,
      identifies_as: isGender(row.identifies_as) ? row.identifies_as : null,
      interested_in: (row.interested_in ?? []).filter(isGender),
    };
  }

  const weightMap = Object.fromEntries(SELVES.map((self) => [self, {} as Record<string, number>])) as Record<Self, Record<string, number>>;
  for (const row of weights.data ?? []) {
    if ((SELVES as readonly string[]).includes(row.self)) weightMap[row.self as Self][row.item] = row.weight;
  }

  const signalMap = Object.fromEntries(SELVES.map((self) => [self, [] as SignalRow[]])) as Record<Self, SignalRow[]>;
  for (const row of signals.data ?? []) {
    if (!(SELVES as readonly string[]).includes(row.self)) continue;
    signalMap[row.self as Self].push({
      kind: row.kind === 'passed' ? 'passed' : 'accepted',
      items: row.items ?? [],
    });
  }

  const items: PrefItem[] = [
    ...(profile.data?.down_to ?? []).map((label: string) => ({
      key: itemKey('down_to', label), label, group: 'Down to' as const, defaultWeight: DEFAULT_WEIGHT,
    })),
    ...(profile.data?.interests ?? []).map((label: string) => ({
      key: itemKey('interest', label), label, group: 'Interests' as const, defaultWeight: DEFAULT_WEIGHT,
    })),
    ...(facts.data ?? []).map((fact) => ({
      key: itemKey(fact.kind === 'employer' ? 'employer' : 'school', fact.org_key),
      label: fact.label,
      group: fact.kind === 'employer' ? ('Work' as const) : ('School' as const),
      defaultWeight: fact.tier === 'claimed' ? 45 : 70,
    })),
  ];

  return {
    discoverable,
    lanes,
    weights: weightMap,
    items,
    mood: mood.data
      ? {
          preset: mood.data.preset,
          bar_shift: mood.data.bar_shift,
          only_selves: mood.data.only_selves,
          include_items: mood.data.include_items,
          expires_at: mood.data.expires_at,
        }
      : null,
    signals: signalMap,
  };
}
