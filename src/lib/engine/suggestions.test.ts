import { describe, expect, test } from 'vitest';
import { hostSuggestions, type SuggestionDraft } from './suggestions';

const NOW = new Date('2026-07-10T12:00:00Z');
const HOUR = 60;
const DAY = 24 * HOUR;

function inMinutes(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

function draft(overrides: Partial<SuggestionDraft> = {}): SuggestionDraft {
  return {
    startsAt: inMinutes(5 * DAY),
    now: NOW,
    inviteMode: 'individual',
    invitees: [{ windowMinutes: DAY, groupStage: 0 }],
    capacity: null,
    hasLocation: true,
    enablePoll: false,
    ...overrides,
  };
}

function ids(input: SuggestionDraft): string[] {
  return hostSuggestions(input).map((s) => s.id);
}

describe('hostSuggestions', () => {
  test('a well-formed plan produces no suggestions', () => {
    expect(hostSuggestions(draft())).toEqual([]);
  });

  test('capacity nudge fires only when the guard is on and plans stack up', () => {
    // Guard off: silent even with a full week.
    expect(
      ids(draft({ upcomingPlanCount: 5 })),
    ).not.toContain('capacity-nudge');
    // Guard on but below threshold: still silent.
    expect(
      ids(draft({ capacityGuard: true, upcomingPlanCount: 2 })),
    ).not.toContain('capacity-nudge');
    // Guard on and at threshold: speaks up.
    expect(
      ids(draft({ capacityGuard: true, upcomingPlanCount: 3 })),
    ).toContain('capacity-nudge');
  });

  test('no invitees → nothing to say', () => {
    expect(hostSuggestions(draft({ invitees: [] }))).toEqual([]);
  });

  test('flags a 15-minute window on a plan days away', () => {
    const result = ids(
      draft({
        startsAt: inMinutes(5 * DAY),
        invitees: [{ windowMinutes: 15, groupStage: 0 }],
      }),
    );
    expect(result).toContain('window-too-short');
  });

  test('does not nag about a short window when the plan is imminent', () => {
    // Coffee in 2 hours with a 15-minute window is exactly right.
    const result = ids(
      draft({
        startsAt: inMinutes(2 * HOUR),
        invitees: [{ windowMinutes: 15, groupStage: 0 }],
      }),
    );
    expect(result).not.toContain('window-too-short');
  });

  test('warns when the cascade would run past the start', () => {
    // Four people, each a 2-day window, on a plan 3 days out: the 4th would be
    // asked ~6 days out — well after it starts.
    const result = ids(
      draft({
        startsAt: inMinutes(3 * DAY),
        invitees: Array.from({ length: 4 }, () => ({
          windowMinutes: 2 * DAY,
          groupStage: 0,
        })),
      }),
    );
    expect(result).toContain('cascade-overruns-start');
    // The sharper timing card supersedes the tight-window one.
    expect(result).not.toContain('window-too-short');
  });

  test('flags a window that closes after the plan starts', () => {
    // One invite, sent now, a 1-day window, but the plan is only 2 hours away.
    const result = ids(
      draft({
        startsAt: inMinutes(2 * HOUR),
        inviteMode: 'all_at_once',
        invitees: [{ windowMinutes: DAY, groupStage: 0 }],
      }),
    );
    expect(result).toContain('window-past-start');
  });

  test('prompts to add a date when none is set', () => {
    const result = hostSuggestions(draft({ startsAt: null }));
    expect(result.map((s) => s.id)).toEqual(['no-date']);
  });

  test('suggests adding a location, but not for a poll plan', () => {
    expect(ids(draft({ hasLocation: false }))).toContain('no-location');
    expect(
      ids(draft({ hasLocation: false, enablePoll: true })),
    ).not.toContain('no-location');
  });

  test('most important suggestion comes first', () => {
    const result = ids(
      draft({
        startsAt: inMinutes(3 * DAY),
        hasLocation: false,
        invitees: Array.from({ length: 4 }, () => ({
          windowMinutes: 2 * DAY,
          groupStage: 0,
        })),
      }),
    );
    expect(result[0]).toBe('cascade-overruns-start');
    expect(result).toContain('no-location');
  });
});
