import { describe, expect, it, test } from 'vitest';
import {
  closesIntoRunoff,
  decidePoll,
  finalists,
  groupConsensus,
  nextWeight,
  scoreOptions,
  type OptionScore,
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

describe('decidePoll', () => {
  const score = (
    optionId: string,
    s: number,
    loves = 0,
    objections = 0,
  ): OptionScore => ({ optionId, score: s, loves, objections, voters: 1, consensus: 0 });

  /**
   * With no votes, `scoreOptions` still returns every idea, ordered by id.
   * "Close voting & pick winner" used to crown the first one.
   */
  it('hands a poll nobody voted on to the host instead of crowning an id', () => {
    const ranked = [score('a', 0), score('b', 0)];
    for (const resolution of ['auto', 'runoff', 'host_pick']) {
      expect(decidePoll({ resolution, phase: 'voting', ranked, voteCount: 0 })).toEqual({
        kind: 'host_pick',
      });
    }
  });

  it('never narrows a runoff on no votes, which deleted suggestions at random', () => {
    const ranked = ['a', 'b', 'c', 'd', 'e'].map((id) => score(id, 0));
    expect(
      decidePoll({ resolution: 'runoff', phase: 'voting', ranked, voteCount: 0 }),
    ).toEqual({ kind: 'host_pick' });
  });

  it('picks a clear leader automatically', () => {
    expect(
      decidePoll({
        resolution: 'auto',
        phase: 'voting',
        ranked: [score('b', 4, 2), score('a', 1)],
        voteCount: 3,
      }),
    ).toEqual({ kind: 'winner', optionId: 'b' });
  });

  it('hands an exact tie to the host rather than to the id order', () => {
    expect(
      decidePoll({
        resolution: 'auto',
        phase: 'voting',
        ranked: [score('a', 2, 1), score('b', 2, 1)],
        voteCount: 2,
      }),
    ).toEqual({ kind: 'host_pick' });
  });

  it('still separates a tie on score by objections, as the ranking does', () => {
    expect(
      decidePoll({
        resolution: 'auto',
        phase: 'voting',
        ranked: [score('a', 2, 1, 0), score('b', 2, 2, 1)],
        voteCount: 4,
      }),
    ).toEqual({ kind: 'winner', optionId: 'a' });
  });

  it('narrows a runoff to the top three, keeping anything level with third', () => {
    const ranked = [score('a', 5), score('b', 4), score('c', 2), score('d', 2), score('e', 0)];
    expect(
      decidePoll({ resolution: 'runoff', phase: 'voting', ranked, voteCount: 6 }),
    ).toEqual({ kind: 'runoff', finalistIds: ['a', 'b', 'c', 'd'] });
  });

  it('decides a runoff with nothing to narrow instead of handing it back', () => {
    // Three ideas: they already are the finalists, so this vote was the final
    // round. The host asked the group to decide, so the group's leader wins.
    const ranked = [score('a', 3), score('b', 1), score('c', 0)];
    expect(
      decidePoll({ resolution: 'runoff', phase: 'voting', ranked, voteCount: 3 }),
    ).toEqual({ kind: 'winner', optionId: 'a' });
  });

  it('decides the runoff round itself by its leader', () => {
    expect(
      decidePoll({
        resolution: 'runoff',
        phase: 'runoff',
        ranked: [score('c', 3), score('a', 1), score('b', 0)],
        voteCount: 3,
      }),
    ).toEqual({ kind: 'winner', optionId: 'c' });
  });

  it('leaves a host-pick poll to the host however the votes fell', () => {
    expect(
      decidePoll({
        resolution: 'host_pick',
        phase: 'voting',
        ranked: [score('a', 9), score('b', 0)],
        voteCount: 5,
      }),
    ).toEqual({ kind: 'host_pick' });
  });
});

describe('closesIntoRunoff', () => {
  it('only promises a runoff when there is something to narrow', () => {
    expect(closesIntoRunoff('runoff', 'voting', 5)).toBe(true);
    expect(closesIntoRunoff('runoff', 'voting', 3)).toBe(false);
    expect(closesIntoRunoff('runoff', 'runoff', 5)).toBe(false);
    expect(closesIntoRunoff('auto', 'voting', 5)).toBe(false);
  });
});
