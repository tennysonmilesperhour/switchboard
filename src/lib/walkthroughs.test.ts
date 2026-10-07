import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURES } from './features';
import {
  WALKTHROUGHS,
  firstRunTourPath,
  primaryWalkthrough,
  tryItFor,
  walkthroughById,
} from './walkthroughs';

/**
 * A walkthrough animates the app doing something. If that something is renamed,
 * moved, or removed, the demo keeps playing the old version, and nobody notices
 * because it is made of made-up data. So every step is tied to the feature
 * index: removing or renaming a feature fails here until the walkthrough that
 * shows it is updated too.
 */

const featureIds = new Set(FEATURES.map((feature) => feature.id));

describe('walkthroughs', () => {
  it('has exactly one primary walkthrough, listed first', () => {
    const primaries = WALKTHROUGHS.filter((tour) => tour.primary);
    expect(primaries).toHaveLength(1);
    expect(WALKTHROUGHS[0].primary).toBe(true);
    expect(primaryWalkthrough().id).toBe(WALKTHROUGHS[0].id);
  });

  it('keeps ids unique and slug-shaped', () => {
    const ids = WALKTHROUGHS.map((tour) => tour.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tour of WALKTHROUGHS) {
      expect(tour.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      const stepIds = tour.steps.map((step) => step.id);
      expect(new Set(stepIds).size, `${tour.id} repeats a step id`).toBe(stepIds.length);
    }
  });

  /** Quick is the point. The index is where detail lives. */
  it('stays short', () => {
    for (const tour of WALKTHROUGHS) {
      expect(tour.steps.length, `${tour.id} has too few steps`).toBeGreaterThanOrEqual(3);
      expect(tour.steps.length, `${tour.id} is too long to be quick`).toBeLessThanOrEqual(7);
      for (const step of tour.steps) {
        expect(step.caption.length, `${tour.id}/${step.id} caption is too long`).toBeLessThanOrEqual(200);
      }
    }
  });

  it('only shows features the index lists', () => {
    for (const tour of WALKTHROUGHS) {
      for (const step of tour.steps) {
        expect(step.features.length, `${tour.id}/${step.id} names no feature`).toBeGreaterThan(0);
        for (const id of step.features) {
          expect(
            featureIds.has(id),
            `${tour.id}/${step.id} shows “${id}”, which is not in src/lib/features.ts — ` +
              'update the walkthrough to match what ships',
          ).toBe(true);
        }
      }
    }
  });

  it('gives every step somewhere to try it', () => {
    for (const tour of WALKTHROUGHS) {
      for (const step of tour.steps) {
        const tryIt = tryItFor(step);
        expect(tryIt, `${tour.id}/${step.id} has no Try it link`).not.toBeNull();
        expect(tryIt!.href).toMatch(/^\//);
      }
    }
  });

  it('has a renderer for every scene', () => {
    const scenes = readFileSync(
      join(process.cwd(), 'src', 'components', 'walkthroughs', 'TourScenes.tsx'),
      'utf8',
    );
    for (const tour of WALKTHROUGHS) {
      for (const step of tour.steps) {
        expect(scenes, `no renderer for scene ${step.scene}`).toMatch(
          new RegExp(`['"]?${step.scene}['"]?:\\s*\\w+,`),
        );
      }
    }
  });

  it('looks walkthroughs up by id', () => {
    expect(walkthroughById('welcome')?.title).toBe('Switchboard in a minute');
    expect(walkthroughById('nope')).toBeNull();
  });

  it('sends a new account through the primary tour, then on to where it was going', () => {
    expect(firstRunTourPath('/')).toBe('/tour/welcome?first=1&next=%2F');
  });

  it('is linked from the feature index', () => {
    const entry = FEATURES.find((feature) => feature.id === 'walkthroughs');
    expect(entry?.href).toBe(`/tour/${primaryWalkthrough().id}`);
  });
});
