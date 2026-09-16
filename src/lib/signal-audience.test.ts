import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * "It won't let me not select one of the groups."
 *
 * An audience is circles AND named people AND groups, but the circle row's
 * catch-all chip was deciding for itself: it lit whenever THAT row was empty.
 * So turning off your last circle lit "Everyone I know" — the broadest possible
 * audience, in answer to narrowing one — and there was no reachable state
 * meaning "just the three people I picked". The chip has to describe the whole
 * choice, which is exactly `isEveryoneAudience`.
 */
describe('the everyone catch-all', () => {
  it('is off when the audience is specific people and no circle', () => {
    expect(
      isEveryoneAudience({ circleIds: [], personIds: ['p1', 'p2', 'p3'], boardIds: [] }),
    ).toBe(false);
  });

  it('is off when the audience is a group and no circle', () => {
    expect(isEveryoneAudience({ circleIds: [], personIds: [], boardIds: ['b1'] })).toBe(
      false,
    );
  });

  it('is on only when nothing at all is chosen', () => {
    expect(isEveryoneAudience({ circleIds: [], personIds: [], boardIds: [] })).toBe(true);
    expect(isEveryoneAudience({ circleIds: ['c1'], personIds: [], boardIds: [] })).toBe(
      false,
    );
  });

  /**
   * The composer is a client component, so the wiring is asserted at the source
   * — the bug was never in the predicate, it was in the chip not being asked.
   */
  it('is wired to the whole audience in the composer', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/signals/SignalBar.tsx'),
      'utf8',
    );
    expect(source).toContain('selected: isEveryoneAudience(audience)');
    // …and tapping it means everyone, so it clears the other two rows too.
    expect(source).toContain('onSelect: () => setAudience(EMPTY_AUDIENCE)');
  });
});

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
