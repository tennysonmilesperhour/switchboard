import { describe, expect, it } from 'vitest';
import {
  deliveryKey,
  existingTarget,
  likelyDuplicates,
  namesLookAlike,
  sameTarget,
  type DedupeTarget,
} from './invitee-dedupe';

function guest(key: string, name: string, contact?: string): DedupeTarget {
  return { key, profileId: null, name, contact: contact ?? null };
}

function member(key: string, name: string, profileId: string): DedupeTarget {
  return { key, profileId, name };
}

describe('deliveryKey', () => {
  it('collapses the ways one phone number can be typed', () => {
    expect(deliveryKey(guest('a', 'Talia', '(801) 555-0134'))).toBe(
      deliveryKey(guest('b', 'T', '+1 801 555 0134')),
    );
  });

  it('is case-insensitive for email and for handles', () => {
    expect(deliveryKey(guest('a', 'Boaz', 'Boaz.Sample@Gmail.com'))).toBe(
      'email:boaz.sample@gmail.com',
    );
    expect(deliveryKey(guest('a', 'Boaz', '@Boaz'))).toBe('handle:boaz');
  });

  it('is null for a guest with no address, who gets a link instead', () => {
    expect(deliveryKey(guest('a', 'Xochitl'))).toBeNull();
    expect(deliveryKey(guest('a', 'Xochitl', '   '))).toBeNull();
  });

  /**
   * A guest row and a member row can never collide, even if somebody's handle
   * happens to equal somebody else's profile id: the namespace prefix is part
   * of the key.
   */
  it('keeps profiles, phones, emails and handles in separate namespaces', () => {
    const keys = [
      deliveryKey(member('a', 'A', 'abc')),
      deliveryKey(guest('b', 'B', '+18015550134')),
      deliveryKey(guest('c', 'C', 'c@example.com')),
      deliveryKey(guest('d', 'D', '@abc')),
    ];
    expect(new Set(keys).size).toBe(4);
  });
});

describe('sameTarget', () => {
  it('is true for one account reached twice', () => {
    expect(sameTarget(member('a', 'Talia', 'p1'), member('b', 'T. Barfuss', 'p1'))).toBe(true);
  });

  /**
   * Two guests with no address are two share links, so they are two
   * invitations however similar their names are. The name check is what looks
   * at those, and it asks rather than refuses.
   */
  it('is false for two unaddressed guests', () => {
    expect(sameTarget(guest('a', 'Xochitl'), guest('b', 'Xochitl'))).toBe(false);
  });
});

describe('existingTarget', () => {
  const list = [member('m1', 'Talia', 'p1'), guest('g1', 'Boaz', 'boaz@example.com')];

  it('finds the row a new add would duplicate', () => {
    expect(existingTarget(list, guest('new', 'Boaz G', 'BOAZ@example.com'))?.key).toBe('g1');
    expect(existingTarget(list, member('new', 'T', 'p1'))?.key).toBe('m1');
  });

  it('never matches a row against itself, so an edit in place is not a duplicate', () => {
    expect(existingTarget(list, list[0])).toBeNull();
  });

  it('is null when the list has nobody at that address', () => {
    expect(existingTarget(list, guest('new', 'Kathryn', '+18015550100'))).toBeNull();
  });
});

describe('namesLookAlike', () => {
  it('pairs a first name with the fuller version of it', () => {
    expect(namesLookAlike('Xochitl', 'Xochitl Sarah Millington')).toBe(true);
    expect(namesLookAlike('KATHRYN MACDONALD POELMAN', 'Kathryn Macdonald')).toBe(true);
  });

  it('ignores punctuation, accents and spacing', () => {
    expect(namesLookAlike('José  O’Neill', 'Jose Oneill')).toBe(true);
  });

  /**
   * The rule is "leading words", not "any word". A middle name shared with
   * somebody else's first name is not evidence of anything, and matching there
   * would flag more pairs than it caught.
   */
  it('does not pair a name with somebody else’s middle name', () => {
    expect(namesLookAlike('Sarah', 'Xochitl Sarah Millington')).toBe(false);
  });

  it('does not pair two different people who share a first name', () => {
    expect(namesLookAlike('Sarah Chen', 'Sarah Millington')).toBe(false);
  });

  it('is false when either name is empty', () => {
    expect(namesLookAlike('', 'Talia')).toBe(false);
    expect(namesLookAlike('   ', 'Talia')).toBe(false);
  });
});

describe('likelyDuplicates', () => {
  /** The list from the feedback, in the order it was built. */
  const reported: DedupeTarget[] = [
    guest('k1', 'Xochitl'),
    member('k2', 'Xochitl Sarah Millington', 'p-xochitl'),
    member('k3', 'Talia Barfuss', 'p-talia'),
    member('k4', 'KATHRYN MACDONALD POELMAN', 'p-kathryn'),
    guest('k5', 'boaz.sample@gmail.com', 'boaz.sample@gmail.com'),
  ];

  it('catches the pair the host caught by eye, and nothing else', () => {
    expect(likelyDuplicates(reported)).toEqual([
      { keepKey: 'k1', dropKey: 'k2', reason: 'name' },
    ]);
  });

  it('reports a repeated address as a certainty rather than a guess', () => {
    const warnings = likelyDuplicates([
      guest('a', 'Boaz', 'boaz@example.com'),
      guest('b', 'Boaz Barfuss', 'BOAZ@EXAMPLE.COM'),
    ]);
    expect(warnings).toEqual([{ keepKey: 'a', dropKey: 'b', reason: 'target' }]);
  });

  /**
   * Three copies produce two warnings, not three. Clearing them bottom-up is
   * then always safe: no warning is left pointing at a row that a previous
   * removal already took away.
   */
  it('pairs each row with at most one earlier row', () => {
    const warnings = likelyDuplicates([
      member('a', 'Talia', 'p1'),
      member('b', 'Talia', 'p1'),
      member('c', 'Talia', 'p1'),
    ]);
    expect(warnings.map((w) => w.dropKey)).toEqual(['b', 'c']);
    expect(warnings.every((w) => w.keepKey === 'a' || w.keepKey === 'b')).toBe(true);
  });

  it('leaves an ordinary list alone', () => {
    expect(
      likelyDuplicates([
        member('a', 'Talia Barfuss', 'p1'),
        member('b', 'Kathryn Macdonald', 'p2'),
        guest('c', 'Boaz', 'boaz@example.com'),
      ]),
    ).toEqual([]);
  });

  it('has nothing to say about a list of one, or none', () => {
    expect(likelyDuplicates([])).toEqual([]);
    expect(likelyDuplicates([guest('a', 'Xochitl')])).toEqual([]);
  });
});
