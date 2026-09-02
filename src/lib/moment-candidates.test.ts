import { describe, expect, it } from 'vitest';
import { buildMomentCandidates } from './moment-candidates';

describe('Moments client candidate payload', () => {
  it('omits identity and free text until curiosity is mutually revealed', () => {
    const found = ['open', 'curious', 'revealed', 'accepted', 'passed'].map((id) => ({
      id,
      experiences: ['Coffee'],
      // Deliberately provide identifying text to prove the payload builder does
      // not trust the anonymous discovery result to withhold it.
      headline: `${id} private headline`,
    }));
    const stageByMoment = new Map(
      found.map(({ id }) => [id, id === 'open' ? 'none' : id]),
    );
    const introByMoment = new Map([
      [
        'revealed',
        { name: 'Revealed Person', interests: ['Coffee'], headline: 'Hello after reveal' },
      ],
      [
        'accepted',
        { name: 'Accepted Person', interests: ['Walking'], headline: 'Hello after accept' },
      ],
    ]);
    // Supply every owner id, including the pre-consent candidates. The builder
    // must still omit them rather than relying on the caller to prune the map.
    const userIdByMoment = new Map(
      found.map(({ id }) => [id, `user-for-${id}`]),
    );

    const candidates = buildMomentCandidates({
      found,
      stageByMoment,
      introByMoment,
      userIdByMoment,
    });

    const open = candidates.find((candidate) => candidate.id === 'open');
    const curious = candidates.find((candidate) => candidate.id === 'curious');
    const revealed = candidates.find((candidate) => candidate.id === 'revealed');
    const accepted = candidates.find((candidate) => candidate.id === 'accepted');

    expect(open).toMatchObject({ stage: 'none', headline: null, intro: null });
    expect(curious).toMatchObject({ stage: 'curious', headline: null, intro: null });
    expect(open).not.toHaveProperty('userId');
    expect(curious).not.toHaveProperty('userId');

    expect(revealed).toMatchObject({
      userId: 'user-for-revealed',
      headline: 'Hello after reveal',
      intro: { name: 'Revealed Person' },
    });
    expect(accepted).toMatchObject({
      userId: 'user-for-accepted',
      headline: 'Hello after accept',
      intro: { name: 'Accepted Person' },
    });
    expect(candidates.some((candidate) => candidate.id === 'passed')).toBe(false);
  });
});
