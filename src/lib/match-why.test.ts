import { describe, expect, it } from 'vitest';
import { listOf, matchReasons } from './match-why';

const base = { kind: 'down_to_connect', activity: '', shared: [], eventTitle: null, introducedBy: null };

describe('matchReasons', () => {
  it('says nothing when nothing is known', () => {
    expect(matchReasons(null)).toEqual([]);
    expect(matchReasons(base)).toEqual([]);
  });

  it('names the friend behind an introduction before anything else', () => {
    expect(matchReasons({ ...base, activity: 'Climbing', introducedBy: 'Priya', shared: ['Hiking'] })).toEqual([
      'Priya introduced you over climbing.',
      'You both picked Hiking.',
    ]);
  });

  it('names the plan behind a hang-again match', () => {
    expect(matchReasons({ ...base, kind: 'hang_again', activity: 'Hang out again', eventTitle: 'Supper club' })).toEqual([
      'You were both at Supper club and both wanted to hang out again.',
    ]);
  });

  it('reads the lane out of a discovery activity instead of showing its suffix', () => {
    const [line] = matchReasons({ ...base, kind: 'discover_connect', activity: 'Vinyl (dating)' });
    expect(line).toBe('You both tapped each other in Discover (dating) over vinyl.');
    expect(matchReasons({ ...base, kind: 'discover_connect', activity: 'Vinyl' })[0]).toBe(
      'You both tapped each other in Discover over vinyl.',
    );
  });

  it('explains a Mutual match by what both were down to do', () => {
    expect(matchReasons({ ...base, activity: 'Coffee' })).toEqual(['You both said you’re down to coffee.']);
  });
});

describe('listOf', () => {
  it('joins one, two, and three the way a sentence would', () => {
    expect(listOf(['a'])).toBe('a');
    expect(listOf(['a', 'b'])).toBe('a and b');
    expect(listOf(['a', 'b', 'c'])).toBe('a, b, and c');
  });
});
