import { describe, expect, test } from 'vitest';
import {
  advanceCascade,
  canAccept,
  simulateCascade,
  spotsRemaining,
  type CascadeConfig,
  type CascadeInvite,
} from './cascade';

const NOW = new Date('2026-07-03T12:00:00Z');
const EARLIER = '2026-07-03T11:00:00Z'; // 60 min before NOW

function invite(overrides: Partial<CascadeInvite> & { id: string }): CascadeInvite {
  return {
    position: 0,
    groupStage: 0,
    status: 'queued',
    windowMinutes: 30,
    sentAt: null,
    ...overrides,
  };
}

const INDIVIDUAL: CascadeConfig = { mode: 'individual', capacity: 1 };

describe('individual mode', () => {
  test('sends the first queued invite when nothing is live', () => {
    const invites = [
      invite({ id: 'a', position: 0 }),
      invite({ id: 'b', position: 1 }),
    ];
    const updates = advanceCascade(invites, INDIVIDUAL, NOW);
    expect(updates).toEqual([
      { id: 'a', status: 'sent', sentAt: NOW.toISOString() },
    ]);
  });

  test('does nothing while an invite is live and unexpired', () => {
    const invites = [
      invite({ id: 'a', position: 0, status: 'sent', sentAt: NOW.toISOString() }),
      invite({ id: 'b', position: 1 }),
    ];
    expect(advanceCascade(invites, INDIVIDUAL, NOW)).toEqual([]);
  });

  test('expires an overdue invite and sends the next in one pass', () => {
    const invites = [
      invite({ id: 'a', position: 0, status: 'sent', sentAt: EARLIER, windowMinutes: 30 }),
      invite({ id: 'b', position: 1 }),
    ];
    const updates = advanceCascade(invites, INDIVIDUAL, NOW);
    expect(updates).toEqual([
      { id: 'a', status: 'expired' },
      { id: 'b', status: 'sent', sentAt: NOW.toISOString() },
    ]);
  });

  test('declined invite is skipped; next queued goes out', () => {
    const invites = [
      invite({ id: 'a', position: 0, status: 'declined' }),
      invite({ id: 'b', position: 1 }),
    ];
    const updates = advanceCascade(invites, INDIVIDUAL, NOW);
    expect(updates).toEqual([
      { id: 'b', status: 'sent', sentAt: NOW.toISOString() },
    ]);
  });

  test('acceptance fills the event: queued invites are cancelled', () => {
    const invites = [
      invite({ id: 'a', position: 0, status: 'accepted' }),
      invite({ id: 'b', position: 1 }),
      invite({ id: 'c', position: 2 }),
    ];
    const updates = advanceCascade(invites, INDIVIDUAL, NOW);
    expect(updates).toEqual([
      { id: 'b', status: 'cancelled' },
      { id: 'c', status: 'cancelled' },
    ]);
  });

  test('is idempotent', () => {
    const invites = [
      invite({ id: 'a', position: 0, status: 'sent', sentAt: EARLIER, windowMinutes: 30 }),
      invite({ id: 'b', position: 1 }),
    ];
    const first = advanceCascade(invites, INDIVIDUAL, NOW);
    const applied = invites.map((i) => {
      const u = first.find((x) => x.id === i.id);
      return u ? { ...i, status: u.status, sentAt: u.sentAt ?? i.sentAt } : i;
    });
    expect(advanceCascade(applied, INDIVIDUAL, NOW)).toEqual([]);
  });

  test('exact window boundary counts as expired', () => {
    const sentAt = new Date(NOW.getTime() - 30 * 60_000).toISOString();
    const invites = [
      invite({ id: 'a', position: 0, status: 'sent', sentAt, windowMinutes: 30 }),
    ];
    expect(advanceCascade(invites, INDIVIDUAL, NOW)).toEqual([
      { id: 'a', status: 'expired' },
    ]);
  });
});

describe('group mode', () => {
  const GROUP: CascadeConfig = { mode: 'group', capacity: 3 };

  test('sends the whole first stage at once', () => {
    const invites = [
      invite({ id: 'a', position: 0, groupStage: 0 }),
      invite({ id: 'b', position: 1, groupStage: 0 }),
      invite({ id: 'c', position: 2, groupStage: 1 }),
    ];
    const updates = advanceCascade(invites, GROUP, NOW);
    expect(updates).toEqual([
      { id: 'a', status: 'sent', sentAt: NOW.toISOString() },
      { id: 'b', status: 'sent', sentAt: NOW.toISOString() },
    ]);
  });

  test('holds stage 2 while stage 1 is unresolved', () => {
    const invites = [
      invite({ id: 'a', position: 0, groupStage: 0, status: 'sent', sentAt: NOW.toISOString() }),
      invite({ id: 'b', position: 1, groupStage: 1 }),
    ];
    expect(advanceCascade(invites, GROUP, NOW)).toEqual([]);
  });

  test('advances to stage 2 when stage 1 resolves with spots left', () => {
    const invites = [
      invite({ id: 'a', position: 0, groupStage: 0, status: 'accepted' }),
      invite({ id: 'b', position: 1, groupStage: 0, status: 'declined' }),
      invite({ id: 'c', position: 2, groupStage: 1 }),
    ];
    const updates = advanceCascade(invites, GROUP, NOW);
    expect(updates).toEqual([
      { id: 'c', status: 'sent', sentAt: NOW.toISOString() },
    ]);
  });

  test('cancels later stages when capacity is reached', () => {
    const invites = [
      invite({ id: 'a', position: 0, groupStage: 0, status: 'accepted' }),
      invite({ id: 'b', position: 1, groupStage: 0, status: 'accepted' }),
      invite({ id: 'c', position: 2, groupStage: 0, status: 'accepted' }),
      invite({ id: 'd', position: 3, groupStage: 1 }),
    ];
    const updates = advanceCascade(invites, GROUP, NOW);
    expect(updates).toEqual([{ id: 'd', status: 'cancelled' }]);
  });

  test('expired stage advances to the next stage in one pass', () => {
    const invites = [
      invite({ id: 'a', position: 0, groupStage: 0, status: 'sent', sentAt: EARLIER, windowMinutes: 30 }),
      invite({ id: 'b', position: 1, groupStage: 1 }),
    ];
    const updates = advanceCascade(invites, GROUP, NOW);
    expect(updates).toEqual([
      { id: 'a', status: 'expired' },
      { id: 'b', status: 'sent', sentAt: NOW.toISOString() },
    ]);
  });
});

describe('capacity helpers', () => {
  test('spotsRemaining respects capacity and defaults individual to 1', () => {
    const invites = [invite({ id: 'a', status: 'accepted' })];
    expect(spotsRemaining(invites, { mode: 'individual', capacity: null })).toBe(0);
    expect(spotsRemaining(invites, { mode: 'group', capacity: 3 })).toBe(2);
    expect(spotsRemaining(invites, { mode: 'group', capacity: null })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  test('canAccept guards a full event', () => {
    const invites = [invite({ id: 'a', status: 'accepted' })];
    expect(canAccept(invites, { mode: 'individual', capacity: 1 })).toBe(false);
    expect(canAccept(invites, { mode: 'group', capacity: 2 })).toBe(true);
  });
});

describe('simulateCascade preview', () => {
  test('individual mode chains windows sequentially', () => {
    const invites = [
      invite({ id: 'a', position: 0, windowMinutes: 30 }),
      invite({ id: 'b', position: 1, windowMinutes: 60 }),
    ];
    const preview = simulateCascade(invites, INDIVIDUAL, NOW);
    expect(preview[0].wouldSendAt).toEqual(NOW);
    expect(preview[1].wouldSendAt).toEqual(new Date(NOW.getTime() + 30 * 60_000));
    expect(preview[1].wouldExpireAt).toEqual(new Date(NOW.getTime() + 90 * 60_000));
  });

  test('group mode sends stages together, spaced by longest window', () => {
    const invites = [
      invite({ id: 'a', position: 0, groupStage: 0, windowMinutes: 30 }),
      invite({ id: 'b', position: 1, groupStage: 0, windowMinutes: 60 }),
      invite({ id: 'c', position: 2, groupStage: 1, windowMinutes: 30 }),
    ];
    const preview = simulateCascade(invites, { mode: 'group', capacity: 5 }, NOW);
    expect(preview[0].wouldSendAt).toEqual(NOW);
    expect(preview[1].wouldSendAt).toEqual(NOW);
    expect(preview[2].wouldSendAt).toEqual(new Date(NOW.getTime() + 60 * 60_000));
  });
});
