import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_WAVES,
  inviteListHint,
  inviteListTitle,
  isStaggered,
  orderMatters,
  rhythmLine,
  wavesMatter,
  wavesOffered,
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

describe('wavesMatter', () => {
  it('is true only for a wave plan', () => {
    // MODES is [all_at_once, individual, group].
    expect(MODES.map(wavesMatter)).toEqual([false, false, true]);
  });

  it('is the other half of the order question', () => {
    // A plan has one kind of order or the other, never both: a chain orders
    // people, waves order groups of them.
    for (const mode of MODES) {
      expect(orderMatters(mode) && wavesMatter(mode), mode).toBe(false);
    }
  });
});

describe('wavesOffered', () => {
  it('offers every wave the plan has, plus one to push somebody back', () => {
    expect(wavesOffered([0, 1, 1])).toEqual([0, 1, 2]);
  });

  it('offers a second wave to a plan that only has one', () => {
    expect(wavesOffered([0, 0, 0])).toEqual([0, 1]);
    expect(wavesOffered([])).toEqual([0, 1]);
  });

  it('stops at the cap rather than growing forever', () => {
    // Five waves exist, so there is no sixth to offer - and set_invite_stage
    // refuses the same value, so a select can never offer what it would reject.
    expect(wavesOffered([MAX_WAVES - 1])).toEqual([0, 1, 2, 3, 4]);
    expect(wavesOffered([MAX_WAVES - 1]).length).toBe(MAX_WAVES);
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

  /**
   * The hint named one capability for every staggered plan, so a wave plan was
   * promised reordering it has no control for. That is the same defect as a
   * missing control: the client's report was "Unable to reorder people in the
   * queue."
   */
  it('points a wave plan at the control it actually has', () => {
    const waves = inviteListHint('group');
    expect(waves).toContain('wave');
    expect(waves).not.toContain('reorder');
    expect(inviteListHint('individual')).toContain('reorder');
  });

  it('offers nothing once the guest list is settled', () => {
    for (const mode of MODES) {
      const settled = inviteListHint(mode, { editable: false });
      expect(settled, mode).not.toMatch(/reorder|re-time|change the wave/);
    }
  });

  it('invites a plan still picking its date to set the order now', () => {
    // Nothing has been sent, every invite is queued, and the database accepts
    // the edit - so the controls are offered rather than hidden.
    expect(inviteListHint('individual', { deciding: true })).toContain(
      'set the order now',
    );
    expect(inviteListHint('group', { deciding: true })).toContain(
      'set the order now',
    );
    // Everyone-at-once has no order to set, so it only says what happens next.
    expect(inviteListHint('all_at_once', { deciding: true })).toBe(
      'Only you see this - invitations go out once the group has decided',
    );
    expect(
      inviteListHint('individual', { deciding: true, editable: false }),
    ).toBe('Only you see this - invitations go out once the group has decided');
  });

  it('always says the view is private, whatever the plan is doing', () => {
    for (const mode of MODES) {
      for (const editable of [true, false]) {
        for (const deciding of [true, false]) {
          expect(
            inviteListHint(mode, { editable, deciding }),
            `${mode} ${editable} ${deciding}`,
          ).toMatch(/^Only you see this - /);
        }
      }
    }
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
    // Called with what it needs to tell the truth about this plan's state, so
    // the assertion stops at the argument list.
    expect(page).toContain('inviteListHint(inviteMode');
    // And reads the stored column through the fail-closed normaliser rather
    // than asserting it into the union.
    expect(page).toContain('asInviteMode(event.invite_mode)');
    expect(page).not.toMatch(/event\.invite_mode as /);
  });
});
