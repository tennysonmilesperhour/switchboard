import { describe, expect, it } from 'vitest';
import {
  audienceIsUnreachable,
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

/**
 * The composer greys out Turn on / Save for an audience it cannot reach. That
 * is the one state where a live signal's Edit button leads to a button that
 * does nothing, so it has to be decided here — on the ids — and not by reading
 * the wording of a sentence meant for a human.
 */
describe('audienceIsUnreachable', () => {
  const unreachable = (audience: Parameters<typeof audienceIsUnreachable>[0]) =>
    audienceIsUnreachable(audience, names);

  it('is false for everyone (an empty audience reaches everyone you know)', () => {
    expect(unreachable({ circleIds: [], personIds: [], boardIds: [] })).toBe(false);
  });
  it('is false while any one circle, person, or group still resolves', () => {
    expect(unreachable({ circleIds: ['c1'], personIds: [], boardIds: [] })).toBe(false);
    expect(unreachable({ circleIds: ['gone'], personIds: ['p1'], boardIds: [] })).toBe(false);
    expect(unreachable({ circleIds: ['gone'], personIds: [], boardIds: ['b1'] })).toBe(false);
    // A deleted circle alongside a live one is still reach, not a dead end.
    expect(unreachable({ circleIds: ['gone', 'c2'], personIds: [], boardIds: [] })).toBe(false);
  });
  it('is true only when every id in a non-empty audience has gone', () => {
    expect(unreachable({ circleIds: ['gone'], personIds: [], boardIds: [] })).toBe(true);
    expect(unreachable({ circleIds: [], personIds: ['ex'], boardIds: [] })).toBe(true);
    expect(unreachable({ circleIds: [], personIds: [], boardIds: ['left'] })).toBe(true);
    expect(unreachable({ circleIds: ['gone'], personIds: ['ex'], boardIds: ['left'] })).toBe(true);
  });
  it('agrees with the summary the reader is shown', () => {
    const dead = { circleIds: ['gone'], personIds: [], boardIds: [] };
    expect(describeAudience(dead, names)).toBe('Nobody yet');
    expect(unreachable(dead)).toBe(true);
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
