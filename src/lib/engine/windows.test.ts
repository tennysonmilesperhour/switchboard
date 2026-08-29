import { describe, expect, test } from 'vitest';
import {
  suggestWindow,
  paceFromChosenWindows,
  sharedWindow,
  windowForNewInvitee,
} from './windows';

const NOW = new Date('2026-07-03T12:00:00Z');

function inMinutes(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

describe('suggestWindow', () => {
  test('event in 2 hours → 15 minute window', () => {
    expect(suggestWindow(inMinutes(120), NOW).windowMinutes).toBe(15);
  });

  test('event tonight (10h) → 1 hour window', () => {
    expect(suggestWindow(inMinutes(10 * 60), NOW).windowMinutes).toBe(60);
  });

  test('event in 2 days → 4 hour window', () => {
    expect(suggestWindow(inMinutes(2 * 24 * 60), NOW).windowMinutes).toBe(240);
  });

  test('event in 5 days → 1 day window', () => {
    expect(suggestWindow(inMinutes(5 * 24 * 60), NOW).windowMinutes).toBe(1440);
  });

  test('event in 2 weeks → 3 day window', () => {
    expect(suggestWindow(inMinutes(14 * 24 * 60), NOW).windowMinutes).toBe(3 * 1440);
  });

  test('event in 3 months → 1 week window', () => {
    expect(suggestWindow(inMinutes(90 * 24 * 60), NOW).windowMinutes).toBe(7 * 1440);
  });

  test('past event clamps to shortest window', () => {
    expect(suggestWindow(inMinutes(-60), NOW).windowMinutes).toBe(15);
  });

  test('snappy pace shortens the default one rung', () => {
    // Base for 5 days out is 1 day (1440); snappy → 4 hours (240).
    expect(suggestWindow(inMinutes(5 * 24 * 60), NOW, 'snappy').windowMinutes).toBe(240);
  });

  test('relaxed pace lengthens the default one rung', () => {
    // Base for 5 days out is 1 day (1440); relaxed → 3 days (4320).
    expect(suggestWindow(inMinutes(5 * 24 * 60), NOW, 'relaxed').windowMinutes).toBe(3 * 1440);
  });

  test('pace shift clamps at the ends of the ladder', () => {
    // Base 15m is already the shortest; snappy can't go lower.
    expect(suggestWindow(inMinutes(120), NOW, 'snappy').windowMinutes).toBe(15);
    // Base 1 week is already the longest; relaxed can't go higher.
    expect(suggestWindow(inMinutes(90 * 24 * 60), NOW, 'relaxed').windowMinutes).toBe(7 * 1440);
  });
});

describe('paceFromChosenWindows', () => {
  test('too little history stays standard', () => {
    expect(paceFromChosenWindows([15, 15])).toBe('standard');
    expect(paceFromChosenWindows([])).toBe('standard');
  });

  test('a snappy host (median ≤ 30m) reads snappy', () => {
    expect(paceFromChosenWindows([15, 15, 30, 60])).toBe('snappy');
  });

  test('a relaxed host (median ≥ 1 day) reads relaxed', () => {
    expect(paceFromChosenWindows([1440, 1440, 4320])).toBe('relaxed');
  });

  test('a middling host reads standard', () => {
    expect(paceFromChosenWindows([60, 240, 240])).toBe('standard');
  });
});

/**
 * The wizard's "Everyone gets ..." control. Five people meant five identical
 * dropdowns, and a host who set four of them and missed one had no way to see
 * the miss — hence a single control, and these tests for the two ways it could
 * lie about what the list says.
 */
describe('sharedWindow', () => {
  test('a list that agrees has that window', () => {
    expect(sharedWindow([1440, 1440, 1440])).toBe(1440);
  });

  test('one person out of step makes it Mixed, not the majority', () => {
    // The control must not round to "mostly a day" — the whole reason it exists
    // is to surface the row the host missed, and a confident number hides it.
    expect(sharedWindow([1440, 1440, 240])).toBeNull();
  });

  test('one person is trivially in agreement with themselves', () => {
    expect(sharedWindow([240])).toBe(240);
  });

  test('nobody has no shared window rather than a default one', () => {
    expect(sharedWindow([])).toBeNull();
  });
});

describe('windowForNewInvitee', () => {
  test('someone added to an agreed list inherits that window', () => {
    // The regression this guards: set everyone to 3 days, add a sixth guest,
    // and the "everyone" control would flip to Mixed because the newcomer
    // silently took the suggestion instead.
    expect(windowForNewInvitee([4320, 4320, 4320], 240)).toBe(4320);
  });

  test('the first person added takes the suggestion', () => {
    expect(windowForNewInvitee([], 240)).toBe(240);
  });

  test('a list that already disagrees falls back to the suggestion', () => {
    // There is no shared answer to inherit, so the suggestion is the only
    // defensible guess — and it leaves the list Mixed, which it already was.
    expect(windowForNewInvitee([1440, 240], 60)).toBe(60);
  });
});
