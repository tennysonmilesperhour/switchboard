import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inviteListHint,
  inviteListTitle,
  isStaggered,
  orderMatters,
  rhythmLine,
} from './invite-rhythm';
import type { InviteMode } from './types';

const MODES: InviteMode[] = ['all_at_once', 'individual', 'group'];

describe('orderMatters', () => {
  it('is true only for a one-at-a-time chain', () => {
    expect(MODES.map(orderMatters)).toEqual([false, true, false]);
  });
});

describe('isStaggered', () => {
  /**
   * Waves are the case that keeps the two questions apart: they go out at
   * different times (so the times are worth showing) while a person's row
   * position decides nothing (so a drag handle would be a lie).
   */
  it('separates "goes out later" from "is further down the list"', () => {
    expect(isStaggered('group')).toBe(true);
    expect(orderMatters('group')).toBe(false);
  });

  it('is false only when everybody is asked at the same instant', () => {
    expect(MODES.map(isStaggered)).toEqual([false, true, true]);
  });
});

describe('rhythmLine', () => {
  it('says plainly that everyone-at-once has no stagger', () => {
    const line = rhythmLine('all_at_once', 5);
    expect(line).toContain('All 5 invitations');
    expect(line).toContain('no order');
  });

  it('counts one invitation without an s', () => {
    expect(rhythmLine('all_at_once', 1)).toContain('All 1 invitation go');
  });

  it('describes every mode, and never in the same words', () => {
    const lines = MODES.map((mode) => rhythmLine(mode, 3));
    expect(new Set(lines).size).toBe(MODES.length);
    for (const line of lines) expect(line.length).toBeGreaterThan(20);
  });

  /**
   * The failure this whole module exists to prevent: the word "flow", and the
   * promise of an order, attached to a plan that has neither.
   */
  it('never promises an order on a plan that has none', () => {
    const line = rhythmLine('all_at_once', 4).toLowerCase();
    for (const word of ['flow', 'in line', 'first', 'next', 'then']) {
      expect(line, `"${word}" in: ${line}`).not.toContain(word);
    }
  });
});

describe('the host’s own list of invitations', () => {
  it('is not called a flow when there is no flow', () => {
    expect(inviteListTitle('all_at_once')).not.toContain('flow');
    expect(inviteListHint('all_at_once')).not.toContain('line');
    expect(inviteListTitle('individual')).toBe('Invitation flow');
  });
});

/**
 * The reason this module exists is that four surfaces each worked the mode out
 * for themselves and two of them got it wrong. These assertions are what stops
 * a fifth from doing it again — the same shape as the rule `share-link.ts`
 * carries for "who may read this plan".
 */
describe('nothing re-derives the rhythm at a call site', () => {
  const surfaces = [
    'src/app/events/new/steps/ReviewStep.tsx',
    'src/app/events/new/steps/OrderStep.tsx',
    'src/components/events/CascadeProgress.tsx',
  ];

  it.each(surfaces)('%s asks this module instead of comparing modes', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).toContain("@/lib/invite-rhythm");
    // A bare comparison against a mode name is the thing that drifted.
    expect(source).not.toMatch(/['"]all_at_once['"]\s*[=!]==/);
    expect(source).not.toMatch(/[=!]==\s*['"]all_at_once['"]/);
  });

  it('the plan page takes its heading and hint from here', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/events/[id]/page.tsx'),
      'utf8',
    );
    expect(page).toContain('inviteListTitle(inviteMode)');
    expect(page).toContain('inviteListHint(inviteMode)');
    // And reads the stored column through the fail-closed normaliser rather
    // than asserting it into the union.
    expect(page).toContain('asInviteMode(event.invite_mode)');
    expect(page).not.toMatch(/event\.invite_mode as /);
  });
});
