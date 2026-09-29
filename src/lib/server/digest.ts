import { createAdminClient } from '@/lib/supabase/admin';
import { pushDigest } from '@/lib/server/notify';
import { emailEnabled, sendEmailWithResult } from '@/lib/server/email';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportOperationalError } from '@/lib/server/observability';
import { absoluteUrl } from '@/lib/links';
import {
  categoryForKind,
  columnForCategory,
  type NotificationColumn,
} from '@/lib/notifications';

/** One line of a digest: "3 new messages", "2 plan updates". */
export interface DigestLine {
  kind: string;
  items: number;
  latestTitle: string | null;
}

/**
 * How each notification kind reads in a summary. Keyed by the `kind` values
 * notifyUsers() actually writes (see `KIND_TO_CATEGORY` in
 * `@/lib/notifications`). This used to be keyed by names no sender used
 * (`invite`, `rsvp`, `plan_update`), so every row but room messages fell to
 * the fallback and a digest read "2 updates, 1 update and 3 updates".
 */
const KIND_LABEL: Record<string, [one: string, many: string]> = {
  room_message: ['new message', 'new messages'],
  event_comment: ['new comment', 'new comments'],
  photo: ['new photo', 'new photos'],
  event_invite: ['invitation', 'invitations'],
  rsvp_accepted: ['answer', 'answers'],
  rsvp_declined_note: ['note from a guest', 'notes from guests'],
  join_request: ['request to join', 'requests to join'],
  poll_opened: ['question to weigh in on', 'questions to weigh in on'],
  poll_suggestion: ['new idea', 'new ideas'],
  event_updated: ['plan update', 'plan updates'],
  event_date_set: ['plan update', 'plan updates'],
  announcement: ['host announcement', 'host announcements'],
  connection_request: ['connection request', 'connection requests'],
  match: ['new match', 'new matches'],
  board_post: ['board post', 'board posts'],
};

const FALLBACK_LABEL: [one: string, many: string] = ['update', 'updates'];

/**
 * The digest body for one person, or null when there is nothing to say.
 *
 * Null rather than "nothing new today" on purpose: a digest that arrives to
 * report an empty day is precisely the interruption this feature exists to
 * remove, and it is the thing that teaches people to mute it.
 *
 * Kinds that read the same are counted together, so two kinds of plan change
 * (or two kinds nobody labelled yet) say "3 plan updates" once rather than
 * "1 plan update and 2 plan updates".
 */
export function digestBody(lines: DigestLine[]): string | null {
  const totals = new Map<string, { label: [string, string]; items: number }>();
  for (const line of lines) {
    if (line.items <= 0) continue;
    const label = KIND_LABEL[line.kind] ?? FALLBACK_LABEL;
    const entry = totals.get(label[1]) ?? { label, items: 0 };
    entry.items += line.items;
    totals.set(label[1], entry);
  }
  if (totals.size === 0) return null;
  const parts = [...totals.values()].map(
    ({ label: [one, many], items }) => `${items} ${items === 1 ? one : many}`,
  );
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** This person's local hour, in their own zone (UTC when the zone is unknown). */
function localHour(now: Date, timeZone: string | null): number {
  const format = (zone: string) =>
    Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: zone,
      }).format(now),
    );
  try {
    return format(timeZone ?? 'UTC');
  } catch {
    // `profiles.timezone` arrives from a client form, and Intl throws a
    // RangeError on a zone it doesn't know. Uncaught, one such row aborted the
    // hourly sweep for everyone after it; it reads as UTC instead.
    return format('UTC');
  }
}

/**
 * Whether it is this person's digest hour, in their own zone.
 *
 * Someone in Auckland should not be summarised at 4pm because the server is in
 * UTC. `timeZone` is the profile's IANA zone; an unset one falls back to UTC,
 * which is wrong for somebody but wrong quietly and consistently rather than
 * arbitrarily.
 */
export function isDigestHour(now: Date, hour: number, timeZone: string | null): boolean {
  return localHour(now, timeZone) === hour;
}

/**
 * How many hourly sweeps after the chosen hour an undelivered digest is still
 * tried. A push provider or mail outage at 8am used to lose the day's digest
 * outright, because it had already been marked sent; now it is retried at 9
 * and 10, and after that tomorrow's digest covers it (the window it reads
 * starts at the last one that actually went out).
 */
export const DIGEST_RETRY_HOURS = 3;

/** Whether `now` is the digest hour or one of its retries, in the person's zone. */
export function isInDigestWindow(now: Date, hour: number, timeZone: string | null): boolean {
  const since = (localHour(now, timeZone) - hour + 24) % 24;
  return since < DIGEST_RETRY_HOURS;
}

/**
 * Drop the kinds whose category this person muted. The digest is a push, and
 * a muted category must not come back through a side door as "3 plan updates".
 * Default-on like the per-item push: only an explicit `false` mutes, and a
 * kind with no category (never muteable on its own) always stays.
 */
export function unmutedDigestLines(
  lines: DigestLine[],
  prefs: Partial<Record<NotificationColumn, boolean | null>>,
): DigestLine[] {
  return lines.filter((line) => {
    const category = categoryForKind(line.kind);
    return !category || prefs[columnForCategory(category)] !== false;
  });
}

/**
 * Whether enough time has passed to send another.
 *
 * A cron that fires more than once an hour is normal, and a retry after a
 * partial failure is normal too. The once-a-day guarantee therefore lives here
 * and in `digest_sent_at`, not in the caller's schedule — a duplicate digest is
 * exactly the noise the feature exists to remove.
 */
export function isDueForDigest(now: Date, sentAt: string | null): boolean {
  if (!sentAt) return true;
  return now.getTime() - new Date(sentAt).getTime() >= 20 * 60 * 60 * 1000;
}

export type DigestEmailOutcome = 'sent' | 'unavailable' | 'failed';

/**
 * The email fallback, for someone push cannot reach (D16). Only ever to a
 * *verified* address — the same rule as every other notification email — and
 * inside the same per-person and global daily ceilings.
 */
async function emailDigest(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  body: string,
): Promise<DigestEmailOutcome> {
  if (!emailEnabled()) return 'unavailable';
  const { data: contact, error } = await admin
    .from('profile_contacts')
    .select('normalized_value')
    .eq('user_id', userId)
    .eq('kind', 'email')
    .not('verified_at', 'is', null)
    .maybeSingle();
  if (error) {
    await reportOperationalError('digest.send', error, { userId, stage: 'email-contact' });
    return 'failed';
  }
  if (!contact?.normalized_value) return 'unavailable';
  if (
    !(await checkRateLimit(`notification-email:${userId}`, 12, 86400, { failClosed: true })) ||
    !(await checkRateLimit('notification-email-global', 100, 86400, { failClosed: true }))
  ) {
    return 'failed';
  }
  const result = await sendEmailWithResult({
    to: contact.normalized_value,
    subject: 'Your day on Switchboard',
    text:
      `Since your last summary: ${body}.\n\n` +
      `See everything: ${absoluteUrl('/notifications')}\n\n` +
      `You get this once a day because the daily summary is on, and push isn’t turned on ` +
      `for any of your devices. Change either in Settings: ${absoluteUrl('/settings')}`,
  });
  if (result.status === 'sent') return 'sent';
  if (result.status === 'not_configured' || result.status === 'invalid_recipient') {
    return 'unavailable';
  }
  return 'failed';
}

/**
 * How one person's digest went.
 *   - `push` / `email`: delivered (by push, or by the email fallback).
 *   - `unreachable`: no push subscription and no verified email to fall back
 *     to. Not an outage, so nothing is logged, and nothing is marked sent:
 *     the next digest that can reach them still covers what this one held.
 *   - `failed`: a channel exists and every attempt failed. Logged, left
 *     unsent, and retried by the next sweep inside the window.
 */
export type DigestDelivery = 'push' | 'email' | 'unreachable' | 'failed';

/** Push first; email when push can't deliver (D16). */
export async function deliverDigest(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  body: string,
): Promise<DigestDelivery> {
  const push = await pushDigest(userId, {
    title: 'Your day on Switchboard',
    body,
    url: '/notifications',
  });
  if (push === 'delivered') return 'push';
  const email = await emailDigest(admin, userId, body);
  if (email === 'sent') return 'email';
  if (push === 'failed' || email === 'failed') return 'failed';
  return 'unreachable';
}

export interface DigestSweepSummary {
  sent: number;
  emailed: number;
  retrying: number;
  unreachable: number;
}

/**
 * Cron entrypoint: send the daily digest to everyone whose hour it is.
 *
 * Opt-in (`digest_enabled` defaults false), so this touches nobody who has not
 * asked for it.
 *
 * `digest_sent_at` is written only once a digest has actually reached a device
 * or an inbox (or when there was nothing to say). It used to be stamped before
 * the push, and counted as sent whatever the push did — so a provider outage,
 * a person with no push subscription, or the digest hour falling inside their
 * quiet hours (the push silently skipped them) each lost that day's summary
 * while the sweep reported success.
 */
export async function sweepDigests(now = new Date()): Promise<DigestSweepSummary> {
  const admin = createAdminClient();
  const summary: DigestSweepSummary = { sent: 0, emailed: 0, retrying: 0, unreachable: 0 };

  const { data: people, error: peopleError } = await admin
    .from('profiles')
    .select(
      'id, digest_hour, digest_sent_at, timezone, notify_plans, notify_suggestions, notify_reminders, notify_messages, notify_social',
    )
    .eq('digest_enabled', true);
  // Thrown, so the cron route records a failed sweep rather than "sent: 0".
  if (peopleError) throw new Error(`digest recipients could not be read: ${peopleError.message}`);

  const stamp = async (userId: string) => {
    const { error } = await admin
      .from('profiles')
      .update({ digest_sent_at: now.toISOString() })
      .eq('id', userId);
    // A digest that went out but could not be stamped may go out once more
    // next hour. That is worth a log line; it is not worth throwing away the
    // rest of the sweep.
    if (error) await reportOperationalError('digest.stamp', error, { userId });
  };

  for (const person of people ?? []) {
    const userId = person.id as string;
    const timeZone = (person.timezone as string | null) ?? null;
    if (!isInDigestWindow(now, person.digest_hour as number, timeZone)) continue;
    if (!isDueForDigest(now, (person.digest_sent_at as string | null) ?? null)) continue;

    const { data: rows, error: itemsError } = await admin.rpc('digest_items', { p_user: userId });
    if (itemsError) {
      await reportOperationalError('digest.items', itemsError, { userId });
      summary.retrying += 1;
      continue;
    }
    const body = digestBody(
      unmutedDigestLines(
        (rows ?? []).map((row: { kind: string; items: number; latest_title: string | null }) => ({
          kind: row.kind,
          items: row.items,
          latestTitle: row.latest_title,
        })),
        person,
      ),
    );

    // Stamp a quiet day too. Otherwise `digest_sent_at` stays put and the
    // next sweep re-reads the same week-long window — and the first busy day
    // reports things from days ago as if they were new.
    if (!body) {
      await stamp(userId);
      continue;
    }

    const delivery = await deliverDigest(admin, userId, body);
    if (delivery === 'push' || delivery === 'email') {
      await stamp(userId);
      summary.sent += 1;
      if (delivery === 'email') summary.emailed += 1;
    } else if (delivery === 'failed') {
      await reportOperationalError(
        'digest.send',
        new Error('daily digest was not delivered by push or email'),
        { userId },
      );
      summary.retrying += 1;
    } else {
      summary.unreachable += 1;
    }
  }
  return summary;
}
