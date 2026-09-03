import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { pendingInvitesInOrder } from './home-focus';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('focused Home hierarchy', () => {
  const home = read('src/app/page.tsx');

  test('puts attention, plans, one guide, and the pillars in that order', () => {
    const landmarks = [
      '<Greeting',
      'title="Waiting on you',
      'aria-label="Your plans"',
      '<PassportCard',
      '<PillarRow',
    ].map((needle) => home.indexOf(needle));

    expect(landmarks.every((index) => index >= 0)).toBe(true);
    expect(landmarks).toEqual([...landmarks].sort((a, b) => a - b));
  });

  test('does not ask for a broadcast or append a second quick-action grid', () => {
    expect(home).toContain('Your invitations and plans, in the order they need you.');
    expect(home).not.toContain('Feeling social? Let people know.');
    expect(home).not.toContain('Make something happen');
  });

  test('explains first-run Mutual, Your Read, and Zones in their empty states', () => {
    expect(read('src/app/mutual/MutualClient.tsx')).toContain(
      'Mutual is a private, two-sided signal',
    );
    expect(read('src/app/you/YouClient.tsx')).toContain(
      'Your Read is a private reflection',
    );
    expect(read('src/app/zones/page.tsx')).toContain(
      'A zone is a shared place',
    );
  });
});

describe('pendingInvitesInOrder', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const invite = (id: string, starts_at: string | null) => ({
    id,
    event: { id: `event-${id}`, title: id, starts_at },
  });

  test('drops invitations to plans that already started', () => {
    const kept = pendingInvitesInOrder(
      [invite('past', '2026-09-01T18:00:00Z'), invite('soon', '2026-09-04T18:00:00Z')],
      now,
    );
    expect(kept.map((row) => row.id)).toEqual(['soon']);
  });

  test('puts the soonest plan first and undated plans last', () => {
    const kept = pendingInvitesInOrder(
      [
        invite('undated', null),
        invite('later', '2026-09-10T18:00:00Z'),
        invite('soon', '2026-09-04T18:00:00Z'),
      ],
      now,
    );
    expect(kept.map((row) => row.id)).toEqual(['soon', 'later', 'undated']);
  });

  test('unwraps the one-element array PostgREST uses for an embedded row', () => {
    const kept = pendingInvitesInOrder(
      [{ id: 'wrapped', event: [{ id: 'e', title: 'Wrapped', starts_at: null }] }],
      now,
    );
    expect(kept[0]?.event.title).toBe('Wrapped');
  });

  test('skips an invite whose plan is gone', () => {
    expect(pendingInvitesInOrder([{ id: 'orphan', event: null }], now)).toEqual([]);
  });
});
