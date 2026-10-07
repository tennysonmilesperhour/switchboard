/**
 * Discovery lanes, weights, and mood: the pure half.
 *
 * The rule itself lives in the database (`private.discovery_pair`), because the
 * database is the boundary. This module holds what the screens need to explain
 * it and to build the values the database accepts: lane names, mood presets,
 * the weight vocabulary, how a lane rides in an activity string, and the
 * suggestions the app offers from a person's own history.
 *
 * Keep the numbers here in step with the migration
 * (`20261008130000_verified_facts_selves_mood.sql`): the tier cut-offs in
 * `weightTier`, the 72 hour mood cap, and the `(dating)` / `(networking)`
 * activity suffixes. `discovery-lanes.test.ts` reads the migration to prove it.
 */

export const SELVES = ['friends', 'dating', 'networking'] as const;
export type Self = (typeof SELVES)[number];

export const SELF_INFO: Record<Self, { label: string; blurb: string; cardHint: string }> = {
  friends: {
    label: 'Friends',
    blurb: 'People to do things with: coffee, hikes, game nights.',
    cardHint: 'A line for people looking for friends',
  },
  dating: {
    label: 'Dating',
    blurb: 'People you might want to date. Off until you turn it on.',
    cardHint: 'A line for people you might date',
  },
  networking: {
    label: 'Networking',
    blurb: 'People worth knowing for work, projects, or a field. Off until you turn it on.',
    cardHint: 'A line for people you might work with',
  },
};

export function isSelf(value: unknown): value is Self {
  return typeof value === 'string' && (SELVES as readonly string[]).includes(value);
}

export const AUDIENCES = ['anyone', 'friends_of_friends', 'verified_only'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_INFO: Record<Audience, { label: string; blurb: string }> = {
  anyone: { label: 'Anyone who matches', blurb: 'Whoever clears the bar.' },
  friends_of_friends: {
    label: 'Friends of friends',
    blurb: 'Only people who share at least one connection with you.',
  },
  verified_only: {
    label: 'Verified people',
    blurb: 'Only people with a school or work place confirmed by email or vouches.',
  },
};

export function isAudience(value: unknown): value is Audience {
  return typeof value === 'string' && (AUDIENCES as readonly string[]).includes(value);
}

export const GENDERS = ['woman', 'man', 'nonbinary', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABEL: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  nonbinary: 'Non-binary',
  other: 'Another identity',
};

export function isGender(value: unknown): value is Gender {
  return typeof value === 'string' && (GENDERS as readonly string[]).includes(value);
}

// ————————————————————————— weights —————————————————————————

/** Default enthusiasm for an interest or activity nobody has rated. */
export const DEFAULT_WEIGHT = 50;

/**
 * The tier the database compares. A weight is bucketed before it is compared
 * (and before it is ever used to decide anything about another person), so a
 * stranger probing with chosen weights learns four values, not a hundred.
 */
export function weightTier(weight: number): number {
  if (weight >= 80) return 90;
  if (weight >= 55) return 65;
  if (weight >= 25) return 40;
  if (weight > 0) return 10;
  return 0;
}

export function weightLabel(weight: number): string {
  if (weight <= 0) return 'Never show';
  if (weight < 25) return 'A little';
  if (weight < 55) return 'Interested';
  if (weight < 80) return 'Really into it';
  return 'Love it';
}

export function clampWeight(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WEIGHT;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export type ItemKind = 'interest' | 'down_to' | 'school' | 'employer';

/** The key a weight is stored under: `interest:Hiking`, `school:byu`. */
export function itemKey(kind: ItemKind, label: string): string {
  return `${kind}:${label}`;
}

export function parseItemKey(key: string): { kind: ItemKind; label: string } | null {
  const index = key.indexOf(':');
  if (index < 1) return null;
  const kind = key.slice(0, index);
  const label = key.slice(index + 1);
  if (!label) return null;
  if (kind !== 'interest' && kind !== 'down_to' && kind !== 'school' && kind !== 'employer') {
    return null;
  }
  return { kind, label };
}

export interface WeightedItem {
  key: string;
  label: string;
  weight: number;
}

/**
 * Split a person's own items by whether they would clear the bar on their own
 * side. This is what the mood sheet shows: the ones that clear are ready, the
 * rest are collapsed and greyed until the person pulls one in.
 */
export function splitByBar(
  items: readonly WeightedItem[],
  bar: number,
): { clear: WeightedItem[]; below: WeightedItem[] } {
  const clear: WeightedItem[] = [];
  const below: WeightedItem[] = [];
  for (const item of items) {
    if (item.weight > 0 && weightTier(item.weight) >= bar) clear.push(item);
    else if (item.weight > 0) below.push(item);
  }
  const order = (a: WeightedItem, b: WeightedItem) =>
    b.weight - a.weight || a.label.localeCompare(b.label);
  return { clear: clear.sort(order), below: below.sort(order) };
}

// ————————————————————————— bar and mood —————————————————————————

/** Default baseline for a lane someone turns on. Friends with no row is 0. */
export const DEFAULT_BAR = 30;

export const MAX_MOOD_HOURS = 72;

export function clampBar(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BAR;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export type MoodPreset = 'open' | 'low_battery' | 'jetlagged' | 'party_only';

export interface MoodInfo {
  id: MoodPreset;
  label: string;
  blurb: string;
  /** Added to every lane's bar while the mood lasts. */
  barShift: number;
  /** Lanes that stay on. Empty means all of them. */
  onlySelves: Self[];
  /** How long it lasts before it ends by itself. */
  hours: number;
}

export const MOODS: readonly MoodInfo[] = [
  {
    id: 'open',
    label: 'Up for anything',
    blurb: 'Lower the bar. More people and smaller overlaps get through.',
    barShift: -25,
    onlySelves: [],
    hours: 24,
  },
  {
    id: 'low_battery',
    label: 'Low battery',
    blurb: 'Only things you rated well. Worth the effort or not at all.',
    barShift: 30,
    onlySelves: [],
    hours: 12,
  },
  {
    id: 'jetlagged',
    label: 'Jet-lagged',
    blurb: 'Only your absolute favourites, shared by someone who feels the same.',
    barShift: 45,
    onlySelves: [],
    hours: 18,
  },
  {
    id: 'party_only',
    label: 'Out for fun',
    blurb: 'Friends only, a little pickier. Dating and networking rest.',
    barShift: 10,
    onlySelves: ['friends'],
    hours: 8,
  },
];

export function moodInfo(id: string | null | undefined): MoodInfo | null {
  return MOODS.find((mood) => mood.id === id) ?? null;
}

export interface ActiveMood {
  preset: string;
  bar_shift: number;
  only_selves: string[];
  include_items: string[];
  expires_at: string;
}

export function moodIsActive(mood: Pick<ActiveMood, 'expires_at'> | null, now: Date = new Date()): boolean {
  return Boolean(mood) && new Date(mood!.expires_at).getTime() > now.getTime();
}

/** What the database will compute for a lane: baseline plus mood, clamped. */
export function effectiveBar(
  baseline: number,
  mood: Pick<ActiveMood, 'bar_shift' | 'expires_at'> | null,
  now: Date = new Date(),
): number {
  const shift = mood && moodIsActive(mood, now) ? mood.bar_shift : 0;
  return Math.min(100, Math.max(0, baseline + shift));
}

export function laneIsPausedByMood(
  self: Self,
  mood: Pick<ActiveMood, 'only_selves' | 'expires_at'> | null,
  now: Date = new Date(),
): boolean {
  if (!mood || !moodIsActive(mood, now)) return false;
  return mood.only_selves.length > 0 && !mood.only_selves.includes(self);
}

/** "until 9:40 pm", "for 3 more hours". Short on purpose: it sits in a chip. */
export function describeMoodRemaining(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 'ended';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min left`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour left' : `${hours} hours left`;
}

// ————————————————————————— lane in the activity —————————————————————————

const LANE_SUFFIX: Record<Exclude<Self, 'friends'>, string> = {
  dating: ' (dating)',
  networking: ' (networking)',
};

/** Longest activity the interest action stores. */
export const MAX_ACTIVITY_LENGTH = 80;

/** Remove a lane suffix, if the text carries one. */
export function stripLane(activity: string): string {
  for (const suffix of Object.values(LANE_SUFFIX)) {
    if (activity.endsWith(suffix)) return activity.slice(0, -suffix.length);
  }
  return activity;
}

/**
 * The activity to save for a context tapped in a lane. Friends is the bare text,
 * which is what every interest saved before lanes already is. The other lanes
 * carry their name so a dating tap and a friends tap on the same context are
 * different asks and can never match each other.
 */
export function activityForLane(self: Self, context: string): string {
  const base = stripLane(context.trim());
  if (self === 'friends') return base.slice(0, MAX_ACTIVITY_LENGTH);
  const suffix = LANE_SUFFIX[self];
  return base.slice(0, MAX_ACTIVITY_LENGTH - suffix.length) + suffix;
}

/** Mirrors `private.discovery_lane_of_activity`. */
export function laneOfActivity(activity: string): Self {
  if (activity.endsWith(LANE_SUFFIX.dating)) return 'dating';
  if (activity.endsWith(LANE_SUFFIX.networking)) return 'networking';
  return 'friends';
}

// ————————————————————————— learning from history —————————————————————————

export interface SignalRow {
  kind: 'accepted' | 'passed';
  items: readonly string[];
}

export interface WeightSuggestion {
  key: string;
  label: string;
  from: number;
  to: number;
  reason: string;
}

const MIN_SIGNALS = 3;
const MAX_SUGGESTIONS = 3;

/**
 * Suggestions from a person's own taps. Never applied silently: the screen
 * shows each with its reason and the person decides.
 *
 *   - Said yes to people who share an item at least three times, and to at least
 *     twice as many as they passed on, while rating it below "Love it": suggest
 *     raising it.
 *   - Passed on people who share an item at least three times, said yes to none,
 *     while rating it "Really into it" or higher: suggest lowering it.
 */
export function suggestWeightChanges(
  signals: readonly SignalRow[],
  weightFor: (key: string) => number,
): WeightSuggestion[] {
  const counts = new Map<string, { accepted: number; passed: number }>();
  for (const signal of signals) {
    for (const key of new Set(signal.items)) {
      const entry = counts.get(key) ?? { accepted: 0, passed: 0 };
      entry[signal.kind] += 1;
      counts.set(key, entry);
    }
  }

  const suggestions: Array<WeightSuggestion & { strength: number }> = [];
  for (const [key, { accepted, passed }] of counts) {
    const parsed = parseItemKey(key);
    if (!parsed) continue;
    const from = weightFor(key);
    if (accepted >= MIN_SIGNALS && accepted >= passed * 2 && from > 0 && from < 80) {
      suggestions.push({
        key,
        label: parsed.label,
        from,
        to: 85,
        reason: `You’ve said yes to ${accepted} ${accepted === 1 ? 'person' : 'people'} who share this.`,
        strength: accepted - passed,
      });
    } else if (passed >= MIN_SIGNALS && accepted === 0 && from >= 55) {
      suggestions.push({
        key,
        label: parsed.label,
        from,
        to: 30,
        reason: `You’ve passed on ${passed} people who share this and said yes to none.`,
        strength: passed,
      });
    }
  }
  return suggestions
    .sort((a, b) => b.strength - a.strength || a.label.localeCompare(b.label))
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      from: entry.from,
      to: entry.to,
      reason: entry.reason,
    }));
}

// ————————————————————————— fit —————————————————————————

export type Fit = 'strong' | 'good' | 'light';

export const FIT_LABEL: Record<Fit, string> = {
  strong: 'Strong overlap',
  good: 'Good overlap',
  light: 'Light overlap',
};

export function isFit(value: unknown): value is Fit {
  return value === 'strong' || value === 'good' || value === 'light';
}
