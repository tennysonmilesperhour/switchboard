import { describe, expect, it } from 'vitest';
import {
  isQuietTime,
  shouldSendInterestNudge,
  suggestionNotice,
  MIN_CONNECTIONS_FOR_INTEREST_NUDGE,
  SUGGESTION_COALESCE_WINDOW_MS,
} from './notify';

/** Build a Date at a fixed UTC hour so assertions are deterministic. */
function atUtcHour(hour: number): Date {
  const hh = String(hour).padStart(2, '0');
  return new Date(`2026-07-09T${hh}:00:00Z`);
}

describe('isQuietTime', () => {
  it('is never quiet when either bound is null', () => {
    expect(isQuietTime(null, 8, 'UTC', atUtcHour(3))).toBe(false);
    expect(isQuietTime(22, null, 'UTC', atUtcHour(3))).toBe(false);
    expect(isQuietTime(null, null, 'UTC', atUtcHour(3))).toBe(false);
  });

  it('handles a same-day window (start < end), end exclusive', () => {
    // Quiet 9:00–17:00
    expect(isQuietTime(9, 17, 'UTC', atUtcHour(12))).toBe(true);
    expect(isQuietTime(9, 17, 'UTC', atUtcHour(9))).toBe(true); // start inclusive
    expect(isQuietTime(9, 17, 'UTC', atUtcHour(8))).toBe(false);
    expect(isQuietTime(9, 17, 'UTC', atUtcHour(17))).toBe(false); // end exclusive
  });

  it('handles a window that wraps midnight (start > end)', () => {
    // Quiet 22:00–08:00
    expect(isQuietTime(22, 8, 'UTC', atUtcHour(23))).toBe(true);
    expect(isQuietTime(22, 8, 'UTC', atUtcHour(2))).toBe(true);
    expect(isQuietTime(22, 8, 'UTC', atUtcHour(22))).toBe(true); // start inclusive
    expect(isQuietTime(22, 8, 'UTC', atUtcHour(8))).toBe(false); // end exclusive
    expect(isQuietTime(22, 8, 'UTC', atUtcHour(12))).toBe(false);
  });

  it('respects the timezone when deciding the local hour', () => {
    // 03:00 UTC is 22:00 the previous day in New York (UTC-5). With a 22–08
    // quiet window that means it IS quiet locally, even though 03 UTC is not.
    expect(isQuietTime(22, 8, 'America/New_York', atUtcHour(3))).toBe(true);
    // 20:00 UTC is 15:00 in New York — outside a 22–08 window.
    expect(isQuietTime(22, 8, 'America/New_York', atUtcHour(20))).toBe(false);
  });

  it('falls back gracefully on an invalid timezone', () => {
    // Bad zone → uses UTC hour; 12 UTC is outside 22–08.
    expect(isQuietTime(22, 8, 'Not/AZone', atUtcHour(12))).toBe(false);
  });
});

describe('shouldSendInterestNudge', () => {
  it('stays silent when too few connections would deanonymize the sender', () => {
    // With fewer connections than the floor, "someone is interested" points at
    // a nearly-identifiable person — the anonymity invariant must win.
    for (let n = 0; n < MIN_CONNECTIONS_FOR_INTEREST_NUDGE; n++) {
      expect(shouldSendInterestNudge(n, 0)).toBe(false);
    }
  });

  it('nudges at or above the connection floor when nothing is pending', () => {
    expect(shouldSendInterestNudge(MIN_CONNECTIONS_FOR_INTEREST_NUDGE, 0)).toBe(
      true,
    );
    expect(
      shouldSendInterestNudge(MIN_CONNECTIONS_FOR_INTEREST_NUDGE + 5, 0),
    ).toBe(true);
  });

  it('suppresses a second nudge while an unread one is still waiting', () => {
    // One standing nudge at a time: avoids spam and stops an idempotent
    // re-submit of the same intent from re-buzzing the target.
    expect(shouldSendInterestNudge(10, 1)).toBe(false);
    expect(shouldSendInterestNudge(10, 3)).toBe(false);
  });
});

describe('suggestionNotice', () => {
  it('describes a single idea by name, so the reader can judge it from the push', () => {
    const notice = suggestionNotice('Sunday roast', 'Tapas at 8', 1);
    expect(notice.title).toBe('New idea · Sunday roast');
    expect(notice.body).toContain('Tapas at 8');
  });

  it('folds a burst into one counted alert instead of one buzz per idea', () => {
    const notice = suggestionNotice('Sunday roast', 'Tapas at 8', 4);
    expect(notice.title).toBe('4 new ideas · Sunday roast');
    expect(notice.body).toContain('Tapas at 8');
  });

  it('never names who suggested it — the poll UI does not, so the push must not', () => {
    // poll_options records no author; a name here would make the notification
    // the one place a suggestion stops being anonymous.
    const notice = suggestionNotice('Sunday roast', 'Tapas at 8', 1);
    expect(`${notice.title} ${notice.body}`).not.toMatch(/suggested by|added by/i);
  });

  it('collapses a brainstorm-length burst, not an hours-apart afterthought', () => {
    expect(SUGGESTION_COALESCE_WINDOW_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(SUGGESTION_COALESCE_WINDOW_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
