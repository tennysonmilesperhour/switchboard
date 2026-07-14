/**
 * Host suggestions: gentle, opt-out coaching for the person setting up a plan.
 *
 * These are non-blocking nudges surfaced on the final review step — never
 * validation. The classic case is "don't give people only 15 minutes to
 * respond when the plan is days away." All rules are pure so they can be
 * unit-tested and shared, and the host can switch the whole set off.
 */

import { suggestWindow } from './windows';
import { simulateCascade } from './cascade';

export interface HostSuggestion {
  /** Stable key, used to remember a per-suggestion dismissal. */
  id: string;
  emoji: string;
  title: string;
  body: string;
}

export interface SuggestionDraft {
  /** When the plan starts, or null if the host hasn't set a date yet. */
  startsAt: Date | null;
  now: Date;
  inviteMode: 'individual' | 'group' | 'all_at_once';
  invitees: Array<{ windowMinutes: number; groupStage: number }>;
  /** Max attendees, null when uncapped / one-on-one. */
  capacity: number | null;
  hasLocation: boolean;
  /** Group is still deciding *what* to do, so a missing spot is expected. */
  enablePoll: boolean;
}

const HOUR = 60;
const DAY = 24 * HOUR;

/** When each invite would go out / expire if nobody accepts, in epoch ms. */
function projectedSends(
  draft: SuggestionDraft,
): Array<{ sendAt: number; expireAt: number }> {
  const now = draft.now.getTime();
  if (draft.inviteMode === 'all_at_once') {
    return draft.invitees.map((invitee) => ({
      sendAt: now,
      expireAt: now + invitee.windowMinutes * 60_000,
    }));
  }
  const individual = draft.inviteMode === 'individual';
  const projection = simulateCascade(
    draft.invitees.map((invitee, index) => ({
      id: String(index),
      position: index,
      groupStage: individual ? index : invitee.groupStage,
      status: 'queued' as const,
      windowMinutes: invitee.windowMinutes,
      sentAt: null,
    })),
    { mode: individual ? 'individual' : 'group', capacity: draft.capacity },
    draft.now,
  );
  return projection.map((entry) => ({
    sendAt: entry.wouldSendAt.getTime(),
    expireAt: entry.wouldExpireAt.getTime(),
  }));
}

function humanDuration(minutes: number): string {
  if (minutes < HOUR) return `${Math.round(minutes)} minutes`;
  if (minutes < DAY) {
    const hours = Math.round(minutes / HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(minutes / DAY);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Produce coaching suggestions for a draft plan, most important first. Returns
 * an empty list when nothing is worth saying — the common, healthy case.
 */
export function hostSuggestions(draft: SuggestionDraft): HostSuggestion[] {
  const out: HostSuggestion[] = [];
  const { invitees, startsAt, now } = draft;
  if (invitees.length === 0) return out;

  const windows = invitees.map((i) => i.windowMinutes);
  const minWindow = Math.min(...windows);
  const leadMinutes = startsAt
    ? (startsAt.getTime() - now.getTime()) / 60_000
    : null;

  // No date yet: response windows count down from send time, so "1 day to
  // respond" gives the invitee no sense of how soon the plan actually is.
  if (!startsAt) {
    out.push({
      id: 'no-date',
      emoji: '📅',
      title: 'No date set yet',
      body: 'Response windows count down from when each invite goes out, so people can’t tell how soon this is. Adding a date and time helps them answer faster.',
    });
    return out;
  }

  if (leadMinutes !== null && leadMinutes > 0) {
    const sends = projectedSends(draft);

    // The strongest signal: with these windows the last person wouldn't even be
    // asked until the plan has already started.
    const lastSend = Math.max(...sends.map((s) => s.sendAt));
    const cascadeOverruns =
      draft.inviteMode !== 'all_at_once' &&
      invitees.length >= 2 &&
      lastSend >= startsAt.getTime();

    if (cascadeOverruns) {
      out.push({
        id: 'cascade-overruns-start',
        emoji: '⏳',
        title: 'Some people won’t be asked in time',
        body: 'With these response windows, the cascade wouldn’t reach the last person until after the plan starts. Try shorter windows, or move the people you most want to come nearer the front.',
      });
    }

    // A comfortably-distant plan paired with a cramped window — the "15 minutes
    // to respond, days out" case. Skipped when the cascade already overruns,
    // since that card makes the same point more sharply.
    if (
      !cascadeOverruns &&
      leadMinutes >= 12 * HOUR &&
      minWindow <= HOUR
    ) {
      out.push({
        id: 'window-too-short',
        emoji: '⏱️',
        title: 'That’s a tight window to reply',
        body: `The plan is about ${humanDuration(leadMinutes)} away, but someone gets only ${humanDuration(minWindow)} to respond. A roomier window means fewer missed invites - Switchboard suggests ${suggestWindow(startsAt, now).label} here.`,
      });
    }

    // A window that stays open past the start: the invitee could still be
    // "deciding" once the plan has begun. Only worth saying if we didn't
    // already flag a bigger timing problem above.
    const windowClosesAfterStart = sends.some(
      (s) => s.sendAt < startsAt.getTime() && s.expireAt > startsAt.getTime(),
    );
    if (!cascadeOverruns && windowClosesAfterStart) {
      out.push({
        id: 'window-past-start',
        emoji: '🔔',
        title: 'A response window runs past the start',
        body: 'At least one person’s window closes after the plan begins, so they could still be deciding when it’s already underway. A shorter window keeps replies ahead of the moment.',
      });
    }
  }

  // Polish, lowest priority: somewhere to actually go. A poll plan is still
  // deciding what to do, so a missing spot is expected there.
  if (!draft.hasLocation && !draft.enablePoll) {
    out.push({
      id: 'no-location',
      emoji: '📍',
      title: 'No place set',
      body: 'Even a rough spot - “my place,” “downtown,” a neighborhood - helps people picture it and say yes faster. You can always firm it up later.',
    });
  }

  return out;
}
