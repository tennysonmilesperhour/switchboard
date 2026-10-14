import { describe, expect, it } from 'vitest';
import { crewPlanHref, groupCrews } from './same-crew';

const now = new Date('2026-10-14T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe('groupCrews', () => {
  it('makes a crew from two or more people matched after the same plan', () => {
    const crews = groupCrews(
      [
        { otherId: 'b', eventId: 'e1', createdAt: daysAgo(2) },
        { otherId: 'c', eventId: 'e1', createdAt: daysAgo(1) },
        { otherId: 'd', eventId: 'e2', createdAt: daysAgo(1) },
      ],
      [],
      now,
    );
    expect(crews).toEqual([{ eventId: 'e1', memberIds: ['b', 'c'], latestAt: daysAgo(1) }]);
  });

  it('lets a crew go after two weeks', () => {
    expect(
      groupCrews(
        [
          { otherId: 'b', eventId: 'e1', createdAt: daysAgo(20) },
          { otherId: 'c', eventId: 'e1', createdAt: daysAgo(15) },
        ],
        [],
        now,
      ),
    ).toEqual([]);
  });

  it('stops offering once you have invited any of them to a newer plan', () => {
    const matches = [
      { otherId: 'b', eventId: 'e1', createdAt: daysAgo(3) },
      { otherId: 'c', eventId: 'e1', createdAt: daysAgo(2) },
    ];
    expect(groupCrews(matches, [{ inviteeIds: ['c'], createdAt: daysAgo(1) }], now)).toEqual([]);
    // A plan from before the match does not count.
    expect(groupCrews(matches, [{ inviteeIds: ['c'], createdAt: daysAgo(5) }], now)).toHaveLength(1);
  });

  it('ignores matches with no plan behind them', () => {
    expect(
      groupCrews(
        [
          { otherId: 'b', eventId: null, createdAt: daysAgo(1) },
          { otherId: 'c', eventId: null, createdAt: daysAgo(1) },
        ],
        [],
        now,
      ),
    ).toEqual([]);
  });
});

describe('crewPlanHref', () => {
  it('puts every member on the new plan', () => {
    expect(crewPlanHref(['b', 'c'], 'Supper club again')).toBe(
      '/events/new?invite=b&invite=c&title=Supper+club+again',
    );
  });
});
