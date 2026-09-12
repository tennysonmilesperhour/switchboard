import { describe, expect, it } from 'vitest';
import {
  describeAudience,
  isEveryoneAudience,
  mostRecentlyChosenCircle,
  resolveDefaultSignalCircle,
  resolveSignalAudience,
} from './signal-audience';

const names = {
  circles: new Map([
    ['c1', 'Close Friends'],
    ['c2', 'Neighbors'],
  ]),
  people: new Map([
    ['p1', 'Sam'],
    ['p2', 'Jo'],
    ['p3', 'Ada'],
  ]),
  groups: new Map([['b1', 'Tantra']]),
};

describe('describeAudience', () => {
  it('says everyone when nothing is chosen', () => {
    expect(describeAudience({ circleIds: [], personIds: [], boardIds: [] }, names)).toBe(
      'Everyone I know',
    );
    expect(isEveryoneAudience({ circleIds: [], personIds: [], boardIds: [] })).toBe(true);
  });
  it('names circles, people, and groups together', () => {
    expect(
      describeAudience({ circleIds: ['c1'], personIds: ['p1', 'p2'], boardIds: ['b1'] }, names),
    ).toBe('Close Friends, Sam and Jo and the Tantra group');
  });
  it('counts people past two', () => {
    expect(describeAudience({ circleIds: [], personIds: ['p1', 'p2', 'p3'], boardIds: [] }, names)).toBe(
      'Sam and 2 others',
    );
  });
  it('drops names that no longer resolve instead of inventing reach', () => {
    expect(describeAudience({ circleIds: ['gone'], personIds: [], boardIds: [] }, names)).toBe(
      'Nobody yet',
    );
    expect(isEveryoneAudience({ circleIds: ['gone'], personIds: [], boardIds: [] })).toBe(false);
  });
});

describe('the remembered circle', () => {
  it('starts a fresh composer at the remembered circle, else the first', () => {
    expect(resolveDefaultSignalCircle(['a', 'b'], 'b')).toBe('b');
    expect(resolveDefaultSignalCircle(['a', 'b'], 'zzz')).toBe('a');
    expect(resolveDefaultSignalCircle([], null)).toBeNull();
  });
  it('keeps an existing explicit audience, even an empty one', () => {
    expect(resolveSignalAudience([], 'a')).toEqual([]);
    expect(resolveSignalAudience(null, 'a')).toEqual(['a']);
  });
  it('remembers the circle just added', () => {
    expect(mostRecentlyChosenCircle(['a'], ['a', 'b'])).toBe('b');
    expect(mostRecentlyChosenCircle(['a', 'b'], ['a'])).toBe('a');
  });
});
