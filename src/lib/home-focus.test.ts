import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

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
