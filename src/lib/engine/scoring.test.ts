import { describe, expect, test } from 'vitest';
import {
  finalists,
  groupConsensus,
  nextWeight,
  scoreOptions,
  type Vote,
  type Weight,
} from './scoring';

function vote(voterId: string, optionId: string, weight: Vote['weight']): Vote {
  return { voterId, optionId, weight };
}

describe('scoreOptions', () => {
  test('sums weights per option and sorts by score', () => {
    const votes = [
      vote('u1', 'tacos', 2),
      vote('u2', 'tacos', 1),
      vote('u1', 'sushi', 1),
      vote('u2', 'sushi', -1),
    ];
    const scores = scoreOptions(['tacos', 'sushi'], votes);
    expect(scores[0]).toMatchObject({ optionId: 'tacos', score: 3 });
    expect(scores[1]).toMatchObject({ optionId: 'sushi', score: 0 });
  });

  test('tie-break: fewest objections wins over raw score tie', () => {
    // Both score 2, but "walk" gets there without anyone objecting.
    const votes = [
      vote('u1', 'movie', 2),
      vote('u2', 'movie', 1),
      vote('u3', 'movie', -1),
      vote('u1', 'walk', 1),
      vote('u2', 'walk', 1),
      vote('u3', 'walk', 0),
    ];
    const scores = scoreOptions(['movie', 'walk'], votes);
    expect(scores[0].optionId).toBe('walk');
  });

  test('second tie-break: most loves', () => {
    const votes = [
      vote('u1', 'a', 2),
      vote('u2', 'a', 0),
      vote('u1', 'b', 1),
      vote('u2', 'b', 1),
    ];
    const scores = scoreOptions(['a', 'b'], votes);
    expect(scores[0].optionId).toBe('a'); // same score 2, no objections, a has a love
  });

  test('unvoted options score zero and stay in the list', () => {
    const scores = scoreOptions(['x'], []);
    expect(scores).toEqual([
      { optionId: 'x', score: 0, loves: 0, objections: 0, voters: 0, consensus: 0 },
    ]);
  });

  test('consensus maps mean weight onto 0-100', () => {
    const all2s = scoreOptions(['a'], [vote('u1', 'a', 2), vote('u2', 'a', 2)]);
    expect(all2s[0].consensus).toBe(100);
    const allNeg = scoreOptions(['a'], [vote('u1', 'a', -1)]);
    expect(allNeg[0].consensus).toBe(0);
    const mixed = scoreOptions(['a'], [vote('u1', 'a', 2), vote('u2', 'a', -1)]);
    expect(mixed[0].consensus).toBe(50); // mean 0.5 → (1.5/3)*100
  });
});

describe('groupConsensus', () => {
  test('returns the leader consensus', () => {
    const votes = [vote('u1', 'a', 2), vote('u1', 'b', -1)];
    expect(groupConsensus(['a', 'b'], votes)).toBe(100);
  });

  test('returns 0 with no options', () => {
    expect(groupConsensus([], [])).toBe(0);
  });
});

describe('nextWeight', () => {
  const RATING_BUTTONS: Weight[] = [2, 1, -1];

  test('an untouched option takes the weight tapped', () => {
    for (const tapped of RATING_BUTTONS) {
      expect(nextWeight(0, tapped)).toBe(tapped);
    }
  });

  test('tapping the weight you already hold clears it', () => {
    for (const tapped of RATING_BUTTONS) {
      expect(nextWeight(tapped, tapped)).toBe(0);
    }
  });

  test('tapping a different weight moves straight to it', () => {
    for (const current of RATING_BUTTONS) {
      for (const tapped of RATING_BUTTONS) {
        if (current === tapped) continue;
        expect(nextWeight(current, tapped)).toBe(tapped);
      }
    }
  });

  test('a repeated tap alternates instead of sticking', () => {
    // The reported symptom was a button that would not stay pressed. Feeding
    // each result back in is the check that matters: as long as the caller
    // passes the weight now on screen, every tap changes something. Passing a
    // stale weight is what made two taps in a row both send the same value and
    // leave the button looking dead.
    let current: Weight = 0;
    const seen: Weight[] = [];
    for (let i = 0; i < 4; i += 1) {
      current = nextWeight(current, 2);
      seen.push(current);
    }
    expect(seen).toEqual([2, 0, 2, 0]);
  });
});

describe('finalists', () => {
  test('returns top N', () => {
    const votes = [
      vote('u1', 'a', 2),
      vote('u1', 'b', 1),
      vote('u1', 'c', 0),
      vote('u1', 'd', -1),
    ];
    const top = finalists(['a', 'b', 'c', 'd'], votes, 3);
    expect(top.map((s) => s.optionId)).toEqual(['a', 'b', 'c']);
  });
});
