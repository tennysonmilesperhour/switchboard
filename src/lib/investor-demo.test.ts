import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURES } from './features';
import { INVESTOR_DEMO, beatDurationMs, sceneBeats } from './investor-demo';

/**
 * The demo is made of staged screens, so if a feature it shows is renamed or
 * removed the demo keeps playing the old version in front of investors. Tying
 * each beat to the feature index makes that a failing test instead.
 */

const featureIds = new Set(FEATURES.map((feature) => feature.id));

describe('investor demo', () => {
  it('opens and closes on a card', () => {
    expect(INVESTOR_DEMO[0].kind).toBe('card');
    expect(INVESTOR_DEMO[INVESTOR_DEMO.length - 1].kind).toBe('card');
  });

  it('keeps beat ids unique and slug-shaped', () => {
    const ids = INVESTOR_DEMO.map((beat) => beat.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('only shows features the index lists', () => {
    for (const beat of sceneBeats()) {
      if (beat.scene === 'group-chat') {
        expect(beat.features, 'the group chat is the problem, not a feature').toHaveLength(0);
        continue;
      }
      expect(beat.features.length, `${beat.id} names no feature`).toBeGreaterThan(0);
      for (const id of beat.features) {
        expect(
          featureIds.has(id),
          `${beat.id} shows “${id}”, which is not in src/lib/features.ts — update the demo to match what ships`,
        ).toBe(true);
      }
    }
  });

  /** Short enough to read aloud in a meeting and to read alone in under two minutes. */
  it('stays tight', () => {
    expect(INVESTOR_DEMO.length).toBeLessThanOrEqual(12);
    for (const beat of INVESTOR_DEMO) {
      expect(beat.caption.length, `${beat.id} caption is too long`).toBeLessThanOrEqual(200);
      expect(beat.notes.length, `${beat.id} needs a talk track`).toBeGreaterThan(20);
    }
    const total = INVESTOR_DEMO.reduce((sum, beat) => sum + beatDurationMs(beat), 0);
    expect(total).toBeLessThanOrEqual(120_000);
  });

  it('gives every scene time to finish before moving on', () => {
    for (const beat of sceneBeats()) expect(beatDurationMs(beat)).toBeGreaterThanOrEqual(6500);
  });

  it('has a renderer for every scene', () => {
    const tourScenes = readFileSync(
      join(process.cwd(), 'src', 'components', 'walkthroughs', 'TourScenes.tsx'),
      'utf8',
    );
    const player = readFileSync(
      join(process.cwd(), 'src', 'components', 'demo', 'DemoPlayer.tsx'),
      'utf8',
    );
    for (const beat of sceneBeats()) {
      const key = /^[a-z]+$/.test(beat.scene) ? `${beat.scene}:` : `'${beat.scene}':`;
      expect(tourScenes.includes(key) || player.includes(key), `no renderer for ${beat.scene}`).toBe(true);
    }
  });
});
