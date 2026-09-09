import { describe, expect, it } from 'vitest';
import { canJumpTo, orderStepNeeded, previousStep, wizardSteps } from './wizard-steps';

/** Six steps, with the first three finished — mid-wizard, mid-plan. */
const PART_DONE = [true, true, true, false, false, false];
const ALL_DONE = [true, true, true, true, true, true];

describe('canJumpTo', () => {
  it('always allows going back, finished or not', () => {
    expect(canJumpTo(0, 5, PART_DONE)).toBe(true);
    expect(canJumpTo(3, 4, PART_DONE)).toBe(true);
    // Even back to a step that is itself incomplete — that is usually exactly
    // why someone is going back.
    expect(canJumpTo(4, 5, [true, true, true, true, false, false])).toBe(true);
  });

  it('allows skipping forward only across finished steps', () => {
    expect(canJumpTo(3, 0, PART_DONE)).toBe(true);
    expect(canJumpTo(5, 0, ALL_DONE)).toBe(true);
  });

  it('refuses to skip over a step that is not finished', () => {
    // Step 3 is unfinished, so nothing beyond it is reachable.
    expect(canJumpTo(4, 0, PART_DONE)).toBe(false);
    expect(canJumpTo(5, 2, PART_DONE)).toBe(false);
  });

  it('refuses to leave the step it is on when that step is unfinished', () => {
    const stuckOnFirst = [false, false, false];
    expect(canJumpTo(1, 0, stuckOnFirst)).toBe(false);
    expect(canJumpTo(2, 0, stuckOnFirst)).toBe(false);
  });

  it('is a no-op on the step already showing', () => {
    expect(canJumpTo(2, 2, ALL_DONE)).toBe(false);
  });

  it('refuses a step that is not on the board', () => {
    expect(canJumpTo(-1, 2, ALL_DONE)).toBe(false);
    expect(canJumpTo(6, 2, ALL_DONE)).toBe(false);
    expect(canJumpTo(1.5, 3, ALL_DONE)).toBe(false);
  });
});

describe('previousStep', () => {
  it('steps back one', () => {
    expect(previousStep(3)).toBe(2);
    expect(previousStep(1)).toBe(0);
  });

  it('stops at the first step — leaving is the browser’s job, not ours', () => {
    expect(previousStep(0)).toBe(0);
  });
});

describe('wizardSteps', () => {
  it('asks who is coming before how invites go out', () => {
    const steps = wizardSteps('individual', 3);
    expect(steps.indexOf('people')).toBeLessThan(steps.indexOf('style'));
    expect(steps).toEqual(['basics', 'people', 'style', 'order', 'visibility', 'review']);
  });

  it('drops "Set the order" when everyone is invited at once', () => {
    expect(orderStepNeeded('all_at_once', 5)).toBe(false);
    expect(wizardSteps('all_at_once', 5)).toEqual([
      'basics',
      'people',
      'style',
      'visibility',
      'review',
    ]);
  });

  it('drops "Set the order" when there is only one person to order', () => {
    expect(orderStepNeeded('individual', 1)).toBe(false);
    expect(orderStepNeeded('group', 0)).toBe(false);
    expect(wizardSteps('individual', 1)).not.toContain('order');
  });

  it('keeps it for a chain or waves with two or more people', () => {
    expect(orderStepNeeded('individual', 2)).toBe(true);
    expect(orderStepNeeded('group', 2)).toBe(true);
  });

  it('always starts on basics and ends on review', () => {
    for (const mode of ['individual', 'group', 'all_at_once'] as const) {
      for (const count of [0, 1, 2, 8]) {
        const steps = wizardSteps(mode, count);
        expect(steps[0]).toBe('basics');
        expect(steps[steps.length - 1]).toBe('review');
      }
    }
  });
});
