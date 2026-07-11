/**
 * Behavioral identity — pure facet computation.
 *
 * Every other identity system reads your *stated* self (birth date, the answers
 * you picked). Switchboard reads your *revealed* self: what you actually said
 * yes and no to, the circles you show up for, and — uniquely — how you felt
 * afterward (`energy_logs`). This module turns those signals into a small set
 * of legible facets. It is deliberately pure: callers derive plain primitives
 * (hours, minutes, counts) from owner-scoped rows and pass them in, so the
 * logic is deterministic and unit-testable, and no timezone/DB concern leaks in.
 *
 * Framing rule baked into the copy: facets are generative, never evaluative.
 * The gap between what you profess and what you show up for is "still waiting
 * for a first outing", not "failed". A mirror that hands you the next step is
 * an ally; one that keeps score is surveillance.
 */

export type Feeling = 'filled' | 'neutral' | 'drained';
export type Confidence = 'emerging' | 'clear' | 'strong';

export const FACET_KEYS = [
  'energy_map',
  'cadence',
  'circle_gravity',
  'interest_alignment',
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export interface Facet {
  key: FacetKey;
  title: string;
  /** One warm, first-person-friendly line. */
  summary: string;
  /** Structured evidence so every read is traceable and never a black box. */
  detail: Record<string, unknown>;
  confidence: Confidence;
  sampleSize: number;
}

/** Confidence rises with evidence; nothing is asserted from a single data point. */
export function confidenceFor(n: number): Confidence {
  if (n >= 12) return 'strong';
  if (n >= 5) return 'clear';
  return 'emerging';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ————————————————————————————— energy map —————————————————————————————

const FEELING_SCORE: Record<Feeling, number> = {
  filled: 1,
  neutral: 0,
  drained: -1,
};

export interface EnergySample {
  feeling: Feeling;
  /** Local hour 0–23 of the event start, or null when unknown. */
  hour: number | null;
  /** Headcount (accepted + host), or null when unknown. */
  size: number | null;
}

interface Bucket {
  avg: number;
  n: number;
}

function timeLabel(hour: number): 'daytime' | 'evening' | 'late night' {
  if (hour >= 5 && hour < 17) return 'daytime';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late night';
}

function sizeLabel(size: number): 'small' | 'midsize' | 'big' {
  if (size <= 4) return 'small';
  if (size <= 12) return 'midsize';
  return 'big';
}

function bucketize<T>(
  samples: EnergySample[],
  label: (s: EnergySample) => T | null,
): Map<T, Bucket> {
  const sums = new Map<T, { total: number; n: number }>();
  for (const s of samples) {
    const key = label(s);
    if (key === null) continue;
    const cur = sums.get(key) ?? { total: 0, n: 0 };
    cur.total += FEELING_SCORE[s.feeling];
    cur.n += 1;
    sums.set(key, cur);
  }
  const out = new Map<T, Bucket>();
  for (const [key, { total, n }] of sums) {
    out.set(key, { avg: total / n, n });
  }
  return out;
}

/** Bucket with the highest / lowest average feeling, needing ≥2 samples to count. */
function extremes<T extends string>(
  buckets: Map<T, Bucket>,
): { best: T | null; worst: T | null } {
  let best: T | null = null;
  let worst: T | null = null;
  let bestAvg = -Infinity;
  let worstAvg = Infinity;
  for (const [key, { avg, n }] of buckets) {
    if (n < 2) continue;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = key;
    }
    if (avg < worstAvg) {
      worstAvg = avg;
      worst = key;
    }
  }
  // A single bucket can't be both the high and the low; nothing to contrast.
  if (best === worst) return { best: null, worst: null };
  return { best, worst };
}

function asDetail<T extends string>(buckets: Map<T, Bucket>): Record<string, Bucket> {
  const obj: Record<string, Bucket> = {};
  for (const [key, b] of buckets) obj[key] = b;
  return obj;
}

export function computeEnergyMap(samples: EnergySample[]): Facet | null {
  if (samples.length < 3) return null;

  const byTime = bucketize(samples, (s) =>
    s.hour === null ? null : timeLabel(s.hour),
  );
  const bySize = bucketize(samples, (s) =>
    s.size === null ? null : sizeLabel(s.size),
  );

  const time = extremes(byTime);
  const size = extremes(bySize);

  const counts = {
    filled: samples.filter((s) => s.feeling === 'filled').length,
    neutral: samples.filter((s) => s.feeling === 'neutral').length,
    drained: samples.filter((s) => s.feeling === 'drained').length,
  };

  // Prefer whichever dimension actually separates; fall back to the raw tilt.
  const fills = size.best ?? time.best;
  const drains = size.worst ?? time.worst;

  let summary: string;
  if (fills && drains) {
    summary = `${cap(fills)} gatherings tend to leave you filled — ${drains} ones are the ones that drain you.`;
  } else if (fills) {
    summary = `${cap(fills)} gatherings are where you come away filled.`;
  } else if (counts.filled >= counts.drained) {
    summary = `You mostly come away from plans filled — ${counts.filled} of your last ${samples.length} left you better than you arrived.`;
  } else {
    summary = `Lately more plans have drained you than filled you. Worth noticing what kind.`;
  }

  return {
    key: 'energy_map',
    title: 'What leaves you filled',
    summary,
    detail: {
      byTime: asDetail(byTime),
      bySize: asDetail(bySize),
      fills: fills ?? null,
      drains: drains ?? null,
      counts,
    },
    confidence: confidenceFor(samples.length),
    sampleSize: samples.length,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// —————————————————————————————— cadence ——————————————————————————————

export interface TempoSample {
  /** Minutes between an invite being sent and you answering it, or null. */
  responseMinutes: number | null;
  /** Hours between your acceptance and the event start, or null. */
  leadHours: number | null;
}

export function computeCadence(samples: TempoSample[]): Facet | null {
  const responses = samples
    .map((s) => s.responseMinutes)
    .filter((v): v is number => v !== null && v >= 0);
  const leads = samples
    .map((s) => s.leadHours)
    .filter((v): v is number => v !== null && v >= 0);

  if (responses.length < 3) return null;

  const medResponse = median(responses)!;
  const medLead = median(leads);

  const responseStyle =
    medResponse < 180 ? 'quick' : medResponse < 1440 ? 'considered' : 'unhurried';

  const planningStyle =
    medLead === null
      ? null
      : medLead < 48
      ? 'spontaneous'
      : medLead < 168
      ? 'flexible'
      : 'a planner';

  let summary: string;
  if (planningStyle) {
    summary = `You're a ${responseStyle} yes-or-no and, when you're in, ${planningStyle}.`;
  } else {
    summary = `You give a ${responseStyle} yes or no.`;
  }
  if (responseStyle === 'quick' && planningStyle === 'spontaneous') {
    summary = `You're a spontaneous yes — quick to answer and happy with short notice.`;
  }

  return {
    key: 'cadence',
    title: 'Your tempo',
    summary,
    detail: {
      medianResponseMinutes: Math.round(medResponse),
      medianLeadHours: medLead === null ? null : Math.round(medLead),
      responseStyle,
      planningStyle,
    },
    confidence: confidenceFor(responses.length),
    sampleSize: responses.length,
  };
}

// ———————————————————————————— circle gravity ————————————————————————————

export interface CircleInputs {
  /** Communities you belong to, with how many posts you've authored in each. */
  boards: { name: string; posts: number }[];
  ritualsActive: number;
  circlesOwned: number;
  invitesAccepted: number;
  /** accepted + declined + expired — invites you had a real chance to answer. */
  invitesResolved: number;
}

export function computeCircleGravity(input: CircleInputs): Facet | null {
  const active = input.boards.filter((b) => b.posts > 0);
  const showUpRate =
    input.invitesResolved >= 3
      ? input.invitesAccepted / input.invitesResolved
      : null;

  const structure =
    input.boards.length + input.ritualsActive + input.circlesOwned;
  if (structure === 0 && showUpRate === null) return null;

  const parts: string[] = [];
  if (active.length > 0) {
    const names = active
      .slice()
      .sort((a, b) => b.posts - a.posts)
      .slice(0, 2)
      .map((b) => b.name);
    parts.push(
      `You're active in ${names.join(' and ')}${
        active.length > names.length ? ` (+${active.length - names.length} more)` : ''
      }`,
    );
  } else if (input.boards.length > 0) {
    parts.push(`You're in ${input.boards.length} boards but quiet in them`);
  }
  if (input.ritualsActive > 0) {
    parts.push(
      `${input.ritualsActive} standing ritual${input.ritualsActive > 1 ? 's' : ''} keep you close to your people`,
    );
  }
  if (showUpRate !== null) {
    parts.push(`you show up for ${Math.round(showUpRate * 100)}% of what you're asked to`);
  }

  const summary = parts.length
    ? `${cap(parts.join('; '))}.`
    : `Your circles are still taking shape.`;

  return {
    key: 'circle_gravity',
    title: 'Where you show up',
    summary,
    detail: {
      boards: input.boards.map((b) => ({
        name: b.name,
        posts: b.posts,
        active: b.posts > 0,
      })),
      ritualsActive: input.ritualsActive,
      circlesOwned: input.circlesOwned,
      showUpRate: showUpRate === null ? null : Math.round(showUpRate * 100),
    },
    confidence: confidenceFor(structure + (showUpRate !== null ? 3 : 0)),
    sampleSize: structure,
  };
}

// ————————————————————————— interest alignment —————————————————————————

export interface InterestInputs {
  /** Interests + down-to activities you've declared, in display form. */
  professed: string[];
  /** Free-text evidence you actually did the thing (attended titles, matches). */
  evidence: string[];
}

/** Normalize for matching without losing the display form. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function computeInterestAlignment(input: InterestInputs): Facet | null {
  const seen = new Set<string>();
  const professed = input.professed
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !seen.has(norm(p)) && seen.add(norm(p)));

  if (professed.length === 0) return null;

  const evidence = input.evidence.map(norm).filter(Boolean);
  const isLived = (token: string) => {
    const t = norm(token);
    return evidence.some((e) => e.includes(t) || t.includes(e));
  };

  const living = professed.filter(isLived);
  const aspirational = professed.filter((p) => !isLived(p));

  let summary: string;
  if (aspirational.length === 0) {
    summary = `You live out everything you say you're into — no gap between talk and turnout.`;
  } else if (living.length === 0) {
    summary = `You've named ${professed.length} interest${professed.length > 1 ? 's' : ''}, but none have made it onto the calendar yet.`;
  } else {
    const sample = aspirational.slice(0, 3).join(', ');
    summary = `You show up for ${living.length} of your interests. ${cap(sample)}${
      aspirational.length > 3 ? ' and others are' : aspirational.length > 1 ? ' are' : ' is'
    } still waiting for a first outing.`;
  }

  return {
    key: 'interest_alignment',
    title: 'Talk vs. turnout',
    summary,
    detail: { living, aspirational },
    confidence: confidenceFor(professed.length + living.length),
    sampleSize: professed.length,
  };
}

// ————————————————————————————— aggregate —————————————————————————————

export interface IdentityInputs {
  energy: EnergySample[];
  tempo: TempoSample[];
  circles: CircleInputs;
  interests: InterestInputs;
}

/** Compute every facet that has enough evidence to exist. Order is stable. */
export function computeFacets(input: IdentityInputs): Facet[] {
  return [
    computeEnergyMap(input.energy),
    computeCadence(input.tempo),
    computeCircleGravity(input.circles),
    computeInterestAlignment(input.interests),
  ].filter((f): f is Facet => f !== null);
}
