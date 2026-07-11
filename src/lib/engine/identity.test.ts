import { describe, it, expect } from 'vitest';
import {
  computeEnergyMap,
  computeCadence,
  computeCircleGravity,
  computeInterestAlignment,
  computeDivergence,
  computeSeasons,
  computeContexts,
  computeFacets,
  confidenceFor,
  type EnergySample,
  type TempoSample,
} from './identity';

describe('confidenceFor', () => {
  it('scales with evidence', () => {
    expect(confidenceFor(1)).toBe('emerging');
    expect(confidenceFor(4)).toBe('emerging');
    expect(confidenceFor(5)).toBe('clear');
    expect(confidenceFor(11)).toBe('clear');
    expect(confidenceFor(12)).toBe('strong');
  });
});

describe('computeEnergyMap', () => {
  it('returns null below the evidence floor', () => {
    expect(computeEnergyMap([{ feeling: 'filled', hour: 10, size: 3 }])).toBeNull();
  });

  it('contrasts the size bucket that fills you against the one that drains', () => {
    const samples: EnergySample[] = [
      { feeling: 'filled', hour: 11, size: 3 },
      { feeling: 'filled', hour: 12, size: 4 },
      { feeling: 'drained', hour: 22, size: 30 },
      { feeling: 'drained', hour: 23, size: 40 },
    ];
    const facet = computeEnergyMap(samples)!;
    expect(facet.key).toBe('energy_map');
    expect(facet.detail.fills).toBe('small');
    expect(facet.detail.drains).toBe('big');
    expect(facet.summary.toLowerCase()).toContain('small');
  });

  it('falls back to raw tilt when no bucket separates', () => {
    const samples: EnergySample[] = [
      { feeling: 'filled', hour: null, size: null },
      { feeling: 'filled', hour: null, size: null },
      { feeling: 'neutral', hour: null, size: null },
    ];
    const facet = computeEnergyMap(samples)!;
    expect(facet.detail.fills).toBeNull();
    expect(facet.summary.toLowerCase()).toContain('filled');
  });
});

describe('computeCadence', () => {
  it('returns null without enough responses', () => {
    expect(
      computeCadence([{ responseMinutes: 10, leadHours: 5 }]),
    ).toBeNull();
  });

  it('reads a fast, short-notice responder as a spontaneous yes', () => {
    const samples: TempoSample[] = [
      { responseMinutes: 20, leadHours: 12 },
      { responseMinutes: 40, leadHours: 24 },
      { responseMinutes: 15, leadHours: 6 },
    ];
    const facet = computeCadence(samples)!;
    expect(facet.detail.responseStyle).toBe('quick');
    expect(facet.detail.planningStyle).toBe('spontaneous');
    expect(facet.summary.toLowerCase()).toContain('spontaneous');
  });

  it('reads slow responses with long lead as considered planner', () => {
    const samples: TempoSample[] = [
      { responseMinutes: 3000, leadHours: 300 },
      { responseMinutes: 2000, leadHours: 400 },
      { responseMinutes: 4000, leadHours: 350 },
    ];
    const facet = computeCadence(samples)!;
    expect(facet.detail.responseStyle).toBe('unhurried');
    expect(facet.detail.planningStyle).toBe('a planner');
  });

  it('ignores null and negative timings', () => {
    const samples: TempoSample[] = [
      { responseMinutes: null, leadHours: null },
      { responseMinutes: -5, leadHours: 10 },
      { responseMinutes: 30, leadHours: 20 },
      { responseMinutes: 45, leadHours: 22 },
      { responseMinutes: 60, leadHours: 25 },
    ];
    const facet = computeCadence(samples)!;
    expect(facet.sampleSize).toBe(3);
  });
});

describe('computeCircleGravity', () => {
  it('names the boards you post in and your show-up rate', () => {
    const facet = computeCircleGravity({
      boards: [
        { name: 'Climbers', posts: 5 },
        { name: 'Book Club', posts: 0 },
      ],
      ritualsActive: 1,
      circlesOwned: 2,
      invitesAccepted: 8,
      invitesResolved: 10,
    })!;
    expect(facet.summary).toContain('Climbers');
    expect(facet.detail.showUpRate).toBe(80);
    expect(facet.summary).toContain('80%');
  });

  it('returns null when there is no structure and too few invites', () => {
    expect(
      computeCircleGravity({
        boards: [],
        ritualsActive: 0,
        circlesOwned: 0,
        invitesAccepted: 1,
        invitesResolved: 1,
      }),
    ).toBeNull();
  });

  it('surfaces show-up rate even with no communities', () => {
    const facet = computeCircleGravity({
      boards: [],
      ritualsActive: 0,
      circlesOwned: 0,
      invitesAccepted: 2,
      invitesResolved: 6,
    })!;
    expect(facet.detail.showUpRate).toBe(33);
  });
});

describe('computeInterestAlignment', () => {
  it('splits professed interests into living and aspirational', () => {
    const facet = computeInterestAlignment({
      professed: ['Climbing', 'Pottery', 'Jazz'],
      evidence: ['Sunday morning climbing', 'weeknight climbing session'],
    })!;
    expect(facet.detail.living).toEqual(['Climbing']);
    expect(facet.detail.aspirational).toEqual(['Pottery', 'Jazz']);
    expect(facet.summary.toLowerCase()).toContain('waiting for a first outing');
  });

  it('dedupes case-insensitively and returns null when nothing professed', () => {
    expect(
      computeInterestAlignment({ professed: [], evidence: ['x'] }),
    ).toBeNull();
    const facet = computeInterestAlignment({
      professed: ['Climbing', 'climbing ', 'Jazz'],
      evidence: [],
    })!;
    expect(facet.sampleSize).toBe(2);
  });

  it('celebrates a fully lived set without judgment', () => {
    const facet = computeInterestAlignment({
      professed: ['Climbing'],
      evidence: ['climbing'],
    })!;
    expect(facet.detail.aspirational).toEqual([]);
    expect(facet.summary.toLowerCase()).toContain('no gap');
  });
});

describe('computeDivergence', () => {
  it('surfaces only claims that contradict behavior', () => {
    const facet = computeDivergence({
      claims: [
        { label: 'yeses', declared: 'a night owl', revealed: 'daytime' },
        { label: 'pace', declared: 'spontaneous', revealed: 'spontaneous' },
      ],
    })!;
    expect(facet.sampleSize).toBe(1);
    expect(facet.summary.toLowerCase()).toContain('night owl');
  });

  it('returns null when nothing diverges or evidence is missing', () => {
    expect(
      computeDivergence({
        claims: [{ label: 'yeses', declared: 'day', revealed: 'day' }],
      }),
    ).toBeNull();
    expect(
      computeDivergence({
        claims: [{ label: 'yeses', declared: 'day', revealed: null }],
      }),
    ).toBeNull();
  });
});

describe('computeSeasons', () => {
  it('reads a rise in yeses as a more outward season', () => {
    const facet = computeSeasons({
      recentAccepts: 8,
      earlierAccepts: 3,
      recentDrainedShare: 0.2,
      earlierDrainedShare: 0.1,
      windowLabel: 'month',
    })!;
    expect(facet.detail.direction).toBe('out more');
  });

  it('reads a drop as pulling inward, and stays quiet on thin data', () => {
    expect(
      computeSeasons({
        recentAccepts: 1,
        earlierAccepts: 1,
        recentDrainedShare: null,
        earlierDrainedShare: null,
        windowLabel: 'month',
      }),
    ).toBeNull();
    const facet = computeSeasons({
      recentAccepts: 2,
      earlierAccepts: 9,
      recentDrainedShare: null,
      earlierDrainedShare: null,
      windowLabel: 'month',
    })!;
    expect(facet.detail.direction).toBe('pulling inward');
  });
});

describe('computeContexts', () => {
  it('names the room you thrive in without naming people', () => {
    const facet = computeContexts({
      soloAvg: 0.8,
      soloN: 4,
      groupAvg: -0.2,
      groupN: 5,
    })!;
    expect(facet.detail.leansIntimate).toBe(true);
    expect(facet.summary.toLowerCase()).toContain('one-on-one');
  });

  it('stays quiet when the two contexts feel about the same', () => {
    expect(
      computeContexts({ soloAvg: 0.5, soloN: 3, groupAvg: 0.4, groupN: 3 }),
    ).toBeNull();
  });
});

describe('computeFacets', () => {
  const base = {
    energy: [
      { feeling: 'filled', hour: 11, size: 3 },
      { feeling: 'filled', hour: 12, size: 4 },
      { feeling: 'drained', hour: 23, size: 30 },
    ] as EnergySample[],
    tempo: [] as TempoSample[],
    circles: {
      boards: [],
      ritualsActive: 0,
      circlesOwned: 0,
      invitesAccepted: 0,
      invitesResolved: 0,
    },
    interests: { professed: ['Jazz'], evidence: [] },
    seasons: {
      recentAccepts: 0,
      earlierAccepts: 0,
      recentDrainedShare: null,
      earlierDrainedShare: null,
      windowLabel: 'month',
    },
    contexts: { soloAvg: null, soloN: 0, groupAvg: null, groupN: 0 },
  };

  it('emits only facets with enough evidence, in stable order', () => {
    const facets = computeFacets({
      ...base,
      divergence: { claims: [] },
      enabledFeatures: new Set(),
    });
    expect(facets.map((f) => f.key)).toEqual(['energy_map', 'interest_alignment']);
  });

  it('hides an optional facet until its feature is toggled on', () => {
    const divergence = {
      claims: [{ label: 'yeses', declared: 'a night owl', revealed: 'daytime' }],
    };
    const off = computeFacets({ ...base, divergence, enabledFeatures: new Set() });
    expect(off.map((f) => f.key)).not.toContain('divergence');

    const on = computeFacets({
      ...base,
      divergence,
      enabledFeatures: new Set(['facet_divergence']),
    });
    expect(on.map((f) => f.key)).toContain('divergence');
  });
});
