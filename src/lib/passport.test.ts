import { describe, expect, it } from 'vitest';
import { FEATURE_GROUPS } from '@/lib/features';
import {
  PASSPORT_STEPS,
  passportByGroup,
  passportProgress,
  type PassportState,
} from '@/lib/passport';

function state(...earned: string[]): PassportState {
  return Object.fromEntries(earned.map((id) => [id, true]));
}

describe('passport steps', () => {
  it('gives every step a unique id, a label, a hint, and somewhere to go', () => {
    const ids = new Set<string>();
    for (const step of PASSPORT_STEPS) {
      expect(step.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(ids.has(step.id), `duplicate step: ${step.id}`).toBe(false);
      ids.add(step.id);
      expect(step.label.trim()).not.toBe('');
      expect(step.hint.trim()).not.toBe('');
      expect(step.href.startsWith('/')).toBe(true);
    }
  });

  /**
   * The passport groups itself by the feature index's own sections, so a
   * renamed or removed group can't leave a stamp pointing at nothing — the
   * index tallies would silently stop rendering for that section.
   */
  it('only uses groups the feature index actually has', () => {
    const groups = new Set(FEATURE_GROUPS.map((group) => group.id));
    for (const step of PASSPORT_STEPS) {
      expect(groups.has(step.group), `${step.id} → unknown group ${step.group}`).toBe(
        true,
      );
    }
  });
});

describe('passportProgress', () => {
  it('counts nothing, and offers the first step, for someone brand new', () => {
    const progress = passportProgress({});
    expect(progress.earned).toBe(0);
    expect(progress.total).toBe(PASSPORT_STEPS.length);
    expect(progress.done).toBe(false);
    expect(progress.next?.id).toBe(PASSPORT_STEPS[0].id);
  });

  it('closes the loop when everything has been tried', () => {
    const progress = passportProgress(state(...PASSPORT_STEPS.map((s) => s.id)));
    expect(progress.earned).toBe(PASSPORT_STEPS.length);
    expect(progress.done).toBe(true);
    // Nothing left to suggest — the card that would name a next step has to be
    // able to tell that it should say something celebratory instead.
    expect(progress.next).toBeNull();
  });

  it('suggests the earliest thing not yet tried, not a random one', () => {
    const [first, second] = PASSPORT_STEPS;
    expect(passportProgress(state(first.id)).next?.id).toBe(second.id);
  });

  it('ignores keys that are not steps, so stale state cannot inflate a count', () => {
    const progress = passportProgress({ 'not-a-step': true });
    expect(progress.earned).toBe(0);
  });

  it('treats an explicit false the same as an absent key', () => {
    const progress = passportProgress({ [PASSPORT_STEPS[0].id]: false });
    expect(progress.earned).toBe(0);
  });
});

describe('passportByGroup', () => {
  it('totals every group the steps mention, and nothing else', () => {
    const byGroup = passportByGroup({});
    const mentioned = new Set(PASSPORT_STEPS.map((step) => step.group));
    expect(new Set(Object.keys(byGroup))).toEqual(mentioned);
    const total = Object.values(byGroup).reduce((sum, g) => sum + g.total, 0);
    expect(total).toBe(PASSPORT_STEPS.length);
  });

  it('credits a stamp to its own group only', () => {
    const step = PASSPORT_STEPS[0];
    const byGroup = passportByGroup(state(step.id));
    expect(byGroup[step.group].earned).toBe(1);
    for (const [group, tally] of Object.entries(byGroup)) {
      if (group !== step.group) expect(tally.earned).toBe(0);
    }
  });
});
