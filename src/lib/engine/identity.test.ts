import { describe, it, expect } from 'vitest';
import {
  computeEnergyMap,
  computeCadence,
  computeCircleGravity,
  computeInterestAlignment,
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

describe('computeFacets', () => {
  it('emits only facets with enough evidence, in stable order', () => {
    const facets = computeFacets({
      energy: [
        { feeling: 'filled', hour: 11, size: 3 },
        { feeling: 'filled', hour: 12, size: 4 },
        { feeling: 'drained', hour: 23, size: 30 },
      ],
      tempo: [],
      circles: {
        boards: [],
        ritualsActive: 0,
        circlesOwned: 0,
        invitesAccepted: 0,
        invitesResolved: 0,
      },
      interests: { professed: ['Jazz'], evidence: [] },
    });
    expect(facets.map((f) => f.key)).toEqual(['energy_map', 'interest_alignment']);
  });
});
