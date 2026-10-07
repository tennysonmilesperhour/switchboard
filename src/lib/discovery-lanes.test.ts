import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVITY_LENGTH,
  MOODS,
  activityForLane,
  clampBar,
  clampWeight,
  describeMoodRemaining,
  effectiveBar,
  itemKey,
  laneIsPausedByMood,
  laneOfActivity,
  parseItemKey,
  splitByBar,
  stripLane,
  suggestWeightChanges,
  weightLabel,
  weightTier,
} from './discovery-lanes';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261007120000_verified_facts_selves_mood.sql'),
  'utf8',
);

describe('agreement with the database', () => {
  it('uses the same tier cut-offs as the migration', () => {
    const tiers = MIGRATION.match(/create or replace function private\.discovery_weight_tier[\s\S]*?\$\$;/)?.[0] ?? '';
    for (const [weight, tier] of [[80, 90], [55, 65], [25, 40]] as const) {
      expect(tiers).toContain(`when p_weight >= ${weight} then ${tier}`);
    }
    expect(tiers).toContain('when p_weight > 0 then 10');
    expect([100, 80, 79, 55, 54, 25, 24, 1, 0].map(weightTier)).toEqual([90, 90, 65, 65, 40, 40, 10, 10, 0]);
  });

  it('uses the same lane suffixes as the migration', () => {
    expect(MIGRATION).toContain("p_activity like '% (dating)' then 'dating'");
    expect(MIGRATION).toContain("p_activity like '% (networking)' then 'networking'");
  });

  it('caps a mood at the migration’s 72 hours, and no preset exceeds it', () => {
    expect(MIGRATION).toContain("now() + interval '72 hours'");
    for (const mood of MOODS) expect(mood.hours).toBeLessThanOrEqual(72);
  });

  it('keeps preset shifts inside the table’s check', () => {
    expect(MIGRATION).toContain('check (bar_shift between -50 and 50)');
    for (const mood of MOODS) expect(Math.abs(mood.barShift)).toBeLessThanOrEqual(50);
  });
});

describe('weights', () => {
  it('names each band', () => {
    expect([0, 10, 40, 70, 95].map(weightLabel)).toEqual([
      'Never show',
      'A little',
      'Interested',
      'Really into it',
      'Love it',
    ]);
  });

  it('clamps whatever arrives', () => {
    expect(clampWeight(250)).toBe(100);
    expect(clampWeight(-3)).toBe(0);
    expect(clampWeight('abc')).toBe(50);
    expect(clampWeight(41.6)).toBe(42);
    expect(clampBar(Number.NaN)).toBe(30);
  });

  it('round-trips item keys and rejects strangers', () => {
    expect(parseItemKey(itemKey('interest', 'Hiking'))).toEqual({ kind: 'interest', label: 'Hiking' });
    expect(parseItemKey(itemKey('school', 'byu'))).toEqual({ kind: 'school', label: 'byu' });
    expect(parseItemKey('nonsense')).toBeNull();
    expect(parseItemKey('colour:red')).toBeNull();
    expect(parseItemKey('interest:')).toBeNull();
  });
});

describe('splitting by the bar', () => {
  const items = [
    { key: 'interest:Chess', label: 'Chess', weight: 90 },
    { key: 'interest:Hiking', label: 'Hiking', weight: 60 },
    { key: 'interest:Vinyl', label: 'Vinyl', weight: 30 },
    { key: 'interest:Golf', label: 'Golf', weight: 0 },
  ];

  it('puts what clears the bar first and collapses the rest', () => {
    const split = splitByBar(items, 65);
    expect(split.clear.map((i) => i.label)).toEqual(['Chess', 'Hiking']);
    expect(split.below.map((i) => i.label)).toEqual(['Vinyl']);
  });

  it('never offers an item the person turned off', () => {
    const split = splitByBar(items, 0);
    expect([...split.clear, ...split.below].map((i) => i.label)).not.toContain('Golf');
  });

  it('a higher bar shrinks the ready list', () => {
    expect(splitByBar(items, 90).clear.map((i) => i.label)).toEqual(['Chess']);
  });
});

describe('mood', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const soon = new Date(now.getTime() + 3 * 3600_000).toISOString();
  const past = new Date(now.getTime() - 60_000).toISOString();

  it('shifts the bar while it lasts and not after', () => {
    expect(effectiveBar(30, { bar_shift: 45, expires_at: soon }, now)).toBe(75);
    expect(effectiveBar(30, { bar_shift: 45, expires_at: past }, now)).toBe(30);
    expect(effectiveBar(30, null, now)).toBe(30);
  });

  it('clamps to the scale', () => {
    expect(effectiveBar(90, { bar_shift: 50, expires_at: soon }, now)).toBe(100);
    expect(effectiveBar(10, { bar_shift: -50, expires_at: soon }, now)).toBe(0);
  });

  it('pauses lanes outside the mood and none when it has ended', () => {
    const mood = { only_selves: ['friends'], expires_at: soon };
    expect(laneIsPausedByMood('dating', mood, now)).toBe(true);
    expect(laneIsPausedByMood('friends', mood, now)).toBe(false);
    expect(laneIsPausedByMood('dating', { ...mood, expires_at: past }, now)).toBe(false);
    expect(laneIsPausedByMood('dating', { only_selves: [], expires_at: soon }, now)).toBe(false);
  });

  it('says how long is left', () => {
    expect(describeMoodRemaining(soon, now)).toBe('3 hours left');
    expect(describeMoodRemaining(new Date(now.getTime() + 20 * 60_000).toISOString(), now)).toBe('20 min left');
    expect(describeMoodRemaining(past, now)).toBe('ended');
  });
});

describe('lanes in an activity', () => {
  it('leaves friends bare and marks the others', () => {
    expect(activityForLane('friends', 'Coffee')).toBe('Coffee');
    expect(activityForLane('dating', 'Coffee')).toBe('Coffee (dating)');
    expect(activityForLane('networking', 'Coffee')).toBe('Coffee (networking)');
  });

  it('never stacks a suffix', () => {
    expect(activityForLane('dating', 'Coffee (dating)')).toBe('Coffee (dating)');
    expect(activityForLane('networking', 'Coffee (dating)')).toBe('Coffee (networking)');
    expect(activityForLane('friends', 'Coffee (dating)')).toBe('Coffee');
    expect(stripLane('Coffee (networking)')).toBe('Coffee');
  });

  it('reads the lane back, as the database does', () => {
    expect(laneOfActivity('Coffee')).toBe('friends');
    expect(laneOfActivity('Coffee (dating)')).toBe('dating');
    expect(laneOfActivity('Coffee (networking)')).toBe('networking');
    expect(laneOfActivity('dating')).toBe('friends');
  });

  it('keeps the lane when the context is long', () => {
    const long = 'x'.repeat(200);
    const activity = activityForLane('dating', long);
    expect(activity.length).toBe(MAX_ACTIVITY_LENGTH);
    expect(laneOfActivity(activity)).toBe('dating');
  });

  it('gives dating and friends taps on one context different strings', () => {
    expect(activityForLane('dating', 'Hiking')).not.toBe(activityForLane('friends', 'Hiking'));
  });
});

describe('suggestions from history', () => {
  const yes = (items: string[]) => ({ kind: 'accepted' as const, items });
  const no = (items: string[]) => ({ kind: 'passed' as const, items });

  it('suggests raising what keeps getting a yes', () => {
    const out = suggestWeightChanges(
      [yes(['interest:Chess']), yes(['interest:Chess']), yes(['interest:Chess', 'interest:Golf'])],
      () => 50,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'interest:Chess', from: 50, to: 85 });
  });

  it('suggests lowering what only ever gets a pass', () => {
    const out = suggestWeightChanges(
      [no(['interest:Golf']), no(['interest:Golf']), no(['interest:Golf'])],
      () => 70,
    );
    expect(out[0]).toMatchObject({ key: 'interest:Golf', from: 70, to: 30 });
  });

  it('stays quiet with too little to go on, or when already right', () => {
    expect(suggestWeightChanges([yes(['interest:Chess']), yes(['interest:Chess'])], () => 50)).toEqual([]);
    expect(
      suggestWeightChanges([yes(['interest:Chess']), yes(['interest:Chess']), yes(['interest:Chess'])], () => 90),
    ).toEqual([]);
    expect(
      suggestWeightChanges([no(['interest:Golf']), no(['interest:Golf']), no(['interest:Golf'])], () => 30),
    ).toEqual([]);
  });

  it('does not raise something the person turned off', () => {
    const out = suggestWeightChanges(
      [yes(['interest:Chess']), yes(['interest:Chess']), yes(['interest:Chess'])],
      () => 0,
    );
    expect(out).toEqual([]);
  });

  it('counts an item once per card and returns at most three', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].flatMap((label) =>
      Array.from({ length: 3 }, () => yes([`interest:${label}`, `interest:${label}`])),
    );
    expect(suggestWeightChanges(many, () => 40)).toHaveLength(3);
  });
});
