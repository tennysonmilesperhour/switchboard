import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUsers } from '@/lib/server/notify';
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

/**
 * Whether it is this person's digest hour, in their own zone.
 *
 * Someone in Auckland should not be summarised at 4pm because the server is in
 * UTC. `timeZone` is the profile's IANA zone; an unset one falls back to UTC,
 * which is wrong for somebody but wrong quietly and consistently rather than
 * arbitrarily.
 */
export function isDigestHour(now: Date, hour: number, timeZone: string | null): boolean {
  const format = (zone: string) =>
    Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: zone,
      }).format(now),
    );
  let local: number;
  try {
    local = format(timeZone ?? 'UTC');
  } catch {
    // `profiles.timezone` arrives from a client form, and Intl throws a
    // RangeError on a zone it doesn't know. Uncaught, one such row aborted the
    // hourly sweep for everyone after it; it reads as UTC instead.
    local = format('UTC');
  }
  return local === hour;
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

/**
 * Cron entrypoint: send the daily digest to everyone whose hour it is.
 *
 * Opt-in (`digest_enabled` defaults false), so this touches nobody who has not
 * asked for it.
 */
export async function sweepDigests(now = new Date()): Promise<number> {
  const admin = createAdminClient();

  const { data: people } = await admin
    .from('profiles')
    .select(
      'id, digest_hour, digest_sent_at, timezone, notify_plans, notify_suggestions, notify_reminders, notify_messages, notify_social',
    )
    .eq('digest_enabled', true);

  let sent = 0;
  for (const person of people ?? []) {
    const timeZone = (person.timezone as string | null) ?? null;
    if (!isDigestHour(now, person.digest_hour as number, timeZone)) continue;
    if (!isDueForDigest(now, (person.digest_sent_at as string | null) ?? null)) continue;

    const { data: rows } = await admin.rpc('digest_items', { p_user: person.id });
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

    // Stamp regardless of whether there was anything to say. Otherwise a quiet
    // day leaves `digest_sent_at` untouched and the next sweep re-reads the
    // same week-long window — and the first busy day reports things from days
    // ago as if they were new.
    await admin
      .from('profiles')
      .update({ digest_sent_at: now.toISOString() })
      .eq('id', person.id);

    if (!body) continue;

    await sendPushToUsers(
      [person.id as string],
      {
        title: 'Your day on Switchboard',
        body,
        url: '/notifications',
      },
      // No single category: the body is already filtered to the categories
      // this person has not muted (`unmutedDigestLines` above), which is how
      // the digest rides the existing per-category preference rather than
      // inventing a second mute.
      undefined,
    );
    sent += 1;
  }
  return sent;
}
