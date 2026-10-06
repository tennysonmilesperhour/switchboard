import { describe, expect, it } from 'vitest';
import { discoveryContextChoice, ownContexts } from './discovery-context';

/** What `list_discoverable_people` returns about `them` to `viewer`. */
function seenBy(
  viewer: { contexts: string[]; downTo: string[]; interests: string[] },
  them: { contexts: string[]; downTo: string[]; interests: string[] },
) {
  const intersect = (a: string[], b: string[]) => a.filter((x) => b.includes(x));
  return {
    contexts: them.contexts,
    shared_down_to: intersect(them.downTo, viewer.downTo),
    shared_interests: intersect(them.interests, viewer.interests),
  };
}

describe('discoveryContextChoice', () => {
  it('reproduces the miss: each side used to default to the other person’s first context', () => {
    const ana = { contexts: ['Coffee', 'Hiking'], downTo: [], interests: [] };
    const bo = { contexts: ['Hiking', 'Coffee'], downTo: [], interests: [] };
    // The old default, for contrast: Ana saves "Hiking", Bo saves "Coffee".
    expect(seenBy(ana, bo).contexts[0]).not.toBe(seenBy(bo, ana).contexts[0]);

    const anaTaps = discoveryContextChoice(seenBy(ana, bo), ana.contexts).defaultContext;
    const boTaps = discoveryContextChoice(seenBy(bo, ana), bo.contexts).defaultContext;
    expect(anaTaps).toBe(boTaps);
  });

  it('agrees from both sides whenever the two people share anything, whatever the order', () => {
    const pool = ['Coffee', 'Hiking', 'Board games', 'Running', 'Live music', 'climbing'];
    // Deterministic pseudo-random subsets and orders.
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = () => pool.filter(() => rand() < 0.45).sort(() => rand() - 0.5);

    for (let i = 0; i < 2000; i += 1) {
      const a = { contexts: pick(), downTo: pick(), interests: pick() };
      const b = { contexts: pick(), downTo: pick(), interests: pick() };
      const aOwn = ownContexts(a.contexts, a.downTo);
      const bOwn = ownContexts(b.contexts, b.downTo);
      const aView = { ...seenBy(a, b), contexts: bOwn };
      const bView = { ...seenBy(b, a), contexts: aOwn };
      const overlap =
        aOwn.some((c) => bOwn.includes(c)) ||
        aView.shared_down_to.length > 0 ||
        aView.shared_interests.length > 0;
      if (!overlap) continue;

      const aChoice = discoveryContextChoice(aView, aOwn);
      const bChoice = discoveryContextChoice(bView, bOwn);
      expect(aChoice.defaultContext).toBe(bChoice.defaultContext);
      expect(aChoice.options).toContain(aChoice.defaultContext);
    }
  });

  it('prefers a context both offer over one only shared as an interest', () => {
    const choice = discoveryContextChoice(
      { contexts: ['Running', 'Coffee'], shared_down_to: [], shared_interests: ['Art'] },
      ['Coffee'],
    );
    expect(choice.defaultContext).toBe('Coffee');
  });

  it('falls back to their first context, then "Connect", and always offers the default', () => {
    expect(
      discoveryContextChoice({ contexts: ['Running'], shared_down_to: [], shared_interests: [] }, ['Coffee'])
        .defaultContext,
    ).toBe('Running');
    const empty = discoveryContextChoice({ contexts: [], shared_down_to: [], shared_interests: [] }, []);
    expect(empty).toEqual({ options: ['Connect'], defaultContext: 'Connect' });
  });

  it('reads the reader’s contexts the way the database reads anyone’s', () => {
    expect(ownContexts(['Coffee'], ['Hiking'])).toEqual(['Coffee']);
    expect(ownContexts([], ['Hiking'])).toEqual(['Hiking']);
    expect(ownContexts(null, null)).toEqual([]);
  });
});
