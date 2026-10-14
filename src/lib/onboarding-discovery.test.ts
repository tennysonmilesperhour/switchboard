import { describe, expect, it } from 'vitest';
import { weightTier } from '@/lib/discovery-lanes';
import {
  MAX_TOP_PICKS,
  TOP_PICK_WEIGHT,
  onboardingSelfRows,
  onboardingWeightRows,
  parseOnboardingDiscovery,
} from './onboarding-discovery';

const base = {
  lanes: [],
  top: [],
  interests: ['Hiking', 'Board games', 'Jazz', 'Pottery'],
  downTo: ['Coffee'],
  identifiesAs: null,
  interestedIn: [],
};

describe('parseOnboardingDiscovery', () => {
  it('keeps known lanes only, in lane order', () => {
    const picked = parseOnboardingDiscovery({ ...base, lanes: ['networking', 'bogus', 'friends'] });
    expect(picked.lanes).toEqual(['friends', 'networking']);
  });

  it('keeps top picks that were submitted with the interests, up to three', () => {
    const picked = parseOnboardingDiscovery({
      ...base,
      top: [
        'interest:Hiking',
        'interest:Hiking',
        'interest:Surfing',
        'down_to:Coffee',
        'interest:Jazz',
        'interest:Pottery',
      ],
    });
    expect(picked.top).toEqual(['interest:Hiking', 'down_to:Coffee', 'interest:Jazz']);
    expect(picked.top.length).toBeLessThanOrEqual(MAX_TOP_PICKS);
  });

  it('drops dating identity unless the dating lane is on', () => {
    const off = parseOnboardingDiscovery({ ...base, identifiesAs: 'woman', interestedIn: ['man'] });
    expect(off.identifiesAs).toBeNull();
    expect(off.interestedIn).toEqual([]);

    const on = parseOnboardingDiscovery({
      ...base,
      lanes: ['dating'],
      identifiesAs: 'woman',
      interestedIn: ['man', 'robot', 'nonbinary'],
    });
    expect(on.identifiesAs).toBe('woman');
    expect(on.interestedIn).toEqual(['man', 'nonbinary']);
  });
});

describe('onboardingSelfRows', () => {
  it('writes nothing when no lane was picked, leaving discovery as it was', () => {
    expect(onboardingSelfRows('u', parseOnboardingDiscovery(base))).toEqual([]);
  });

  it('writes every lane once any is picked, so dating alone never turns friends on', () => {
    const rows = onboardingSelfRows('u', parseOnboardingDiscovery({ ...base, lanes: ['dating'] }));
    expect(rows.map((row) => [row.self, row.enabled])).toEqual([
      ['friends', false],
      ['dating', true],
      ['networking', false],
    ]);
    expect(rows.find((row) => row.self === 'friends')?.bar).toBe(0);
  });

  it('keeps dating identity on the dating row only (the table check refuses it elsewhere)', () => {
    const rows = onboardingSelfRows('u', parseOnboardingDiscovery({
      ...base,
      lanes: ['friends', 'dating'],
      identifiesAs: 'man',
      interestedIn: ['woman'],
    }));
    for (const row of rows) {
      if (row.self === 'dating') {
        expect(row.identifies_as).toBe('man');
        expect(row.interested_in).toEqual(['woman']);
      } else {
        expect(row.identifies_as).toBeNull();
        expect(row.interested_in).toEqual([]);
      }
    }
  });
});

describe('onboardingWeightRows', () => {
  it('weights top picks in friends and every picked lane, at the top tier', () => {
    const picked = parseOnboardingDiscovery({
      ...base,
      lanes: ['networking'],
      top: ['interest:Hiking'],
    });
    const rows = onboardingWeightRows('u', picked);
    expect(rows.map((row) => row.self)).toEqual(['friends', 'networking']);
    expect(rows.every((row) => row.item === 'interest:Hiking')).toBe(true);
    expect(weightTier(TOP_PICK_WEIGHT)).toBe(90);
  });

  it('writes nothing without top picks', () => {
    expect(onboardingWeightRows('u', parseOnboardingDiscovery({ ...base, lanes: ['friends'] }))).toEqual([]);
  });
});
