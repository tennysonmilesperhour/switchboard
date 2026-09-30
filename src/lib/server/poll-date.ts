import { createAdminClient } from '@/lib/supabase/admin';
import { reportOperationalError } from '@/lib/server/observability';
import { resolveEventZone } from '@/lib/server/event-zone';
import { parseGridSlot, slotStartsAt } from '@/lib/availability';
import { sameInstant } from '@/lib/plan-time';
import type { DateOutcome } from '@/lib/poll-notices';

/** Statuses in which a decision may still give the plan its date. */
const DATEABLE = new Set(['deciding', 'inviting', 'confirmed']);

/**
 * The grid slot a winning idea stands for, if it is one.
 *
 * "Put the best times on the poll" writes the slot into both the label and
 * `detail`; the label can be reworded afterwards, so either will do. Anything
 * else is the group's own words, and a date is never parsed out of prose —
 * the host sets it (decision D5).
 */
export function winningSlot(option: { label: string; detail: string | null } | null): string | null {
  if (!option) return null;
  return parseGridSlot(option.label) ?? parseGridSlot(option.detail);
}

/**
 * Give the plan the date its decided poll chose.
 *
 * Neither the deadline sweep nor "Choose this" ever wrote the winner to the
 * plan, so a group could settle on Friday evening and the plan still read
 * "Time TBD": no calendar link, no reminders, and "The date is set" went out
 * with no date in it. Now a winning grid slot sets `starts_at` to that band's
 * start in the plan's zone (evening means 6pm — decision D5), and pins the
 * zone on a plan that never recorded one, so every surface renders the same
 * clock time.
 *
 * Left alone, with the reason returned so the notices can say what's next:
 * a free-text winner or no winner (`none`: the host sets the date), a time
 * that has already started (`past`), and a plan that already has a date and
 * has moved past deciding (`kept`: invitations went out for that date, and a
 * poll does not move it under everyone's feet — the host can, from Edit plan).
 *
 * Idempotent, so it runs again wherever the follow-up unlock is retried. Never
 * throws: the decision is already saved, and a plan without its date still has
 * a way forward (the host's "Set the date"), where an exception here would
 * stall the deadline sweep for every other poll.
 */
export async function applyDecidedDate(pollId: string): Promise<DateOutcome> {
  try {
    const admin = createAdminClient();
    const { data: poll, error: pollError } = await admin
      .from('polls')
      .select('event_id, phase, winning_option_id')
      .eq('id', pollId)
      .maybeSingle();
    if (pollError) throw pollError;
    if (!poll || poll.phase !== 'decided' || !poll.winning_option_id) return { kind: 'none' };

    const { data: option, error: optionError } = await admin
      .from('poll_options')
      .select('poll_id, label, detail')
      .eq('id', poll.winning_option_id)
      .maybeSingle();
    if (optionError) throw optionError;
    const slot = option?.poll_id === pollId ? winningSlot(option) : null;
    if (!slot) return { kind: 'none' };

    const { data: event, error: eventError } = await admin
      .from('events')
      .select('id, host_id, status, starts_at, ends_at, time_zone')
      .eq('id', poll.event_id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event || !DATEABLE.has(event.status)) return { kind: 'none' };

    // The plan's zone, falling back to the host's for a plan created before
    // plans recorded one — the same zone its page renders the time in.
    const timeZone = (await resolveEventZone(admin, event)) ?? 'UTC';
    const startsAt = slotStartsAt(slot, timeZone);
    if (!startsAt) return { kind: 'none' };
    if (Date.parse(startsAt) <= Date.now()) return { kind: 'past' };
    if (sameInstant(event.starts_at, startsAt)) return { kind: 'set', startsAt, timeZone };
    if (event.starts_at && event.status !== 'deciding') return { kind: 'kept' };

    const endsBeforeStart = event.ends_at && Date.parse(event.ends_at) <= Date.parse(startsAt);
    let update = admin
      .from('events')
      .update({
        starts_at: startsAt,
        ...(event.time_zone === timeZone ? {} : { time_zone: timeZone }),
        ...(endsBeforeStart ? { ends_at: null } : {}),
        // The reminder markers describe the time they were sent for; a plan
        // given a new time gets its reminders for that time.
        reminded_day_before_at: null,
        reminded_soon_at: null,
      })
      .eq('id', event.id)
      .eq('status', event.status);
    // Past deciding, only fill a date that is still missing — never replace
    // one the host set while this was being decided.
    if (event.status !== 'deciding') update = update.is('starts_at', null);
    const { data: written, error: writeError } = await update.select('id');
    if (writeError) throw writeError;
    if (!written || written.length === 0) return { kind: 'kept' };
    return { kind: 'set', startsAt, timeZone };
  } catch (error) {
    await reportOperationalError('poll.apply-date', error, { pollId });
    return { kind: 'failed' };
  }
}
