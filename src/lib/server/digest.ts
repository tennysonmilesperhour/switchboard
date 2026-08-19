import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUsers } from '@/lib/server/notify';

/** One line of a digest: "3 new messages", "2 plan updates". */
export interface DigestLine {
  kind: string;
  items: number;
  latestTitle: string | null;
}

/** How each notification kind reads in a summary. */
const KIND_LABEL: Record<string, [one: string, many: string]> = {
  room_message: ['new message', 'new messages'],
  invite: ['invitation', 'invitations'],
  rsvp: ['answer', 'answers'],
  poll_opened: ['question to weigh in on', 'questions to weigh in on'],
  suggestion_added: ['new idea', 'new ideas'],
  plan_update: ['plan update', 'plan updates'],
};

function describe(line: DigestLine): string {
  const [one, many] = KIND_LABEL[line.kind] ?? ['update', 'updates'];
  return `${line.items} ${line.items === 1 ? one : many}`;
}

/**
 * The digest body for one person, or null when there is nothing to say.
 *
 * Null rather than "nothing new today" on purpose: a digest that arrives to
 * report an empty day is precisely the interruption this feature exists to
 * remove, and it is the thing that teaches people to mute it.
 */
export function digestBody(lines: DigestLine[]): string | null {
  const real = lines.filter((line) => line.items > 0);
  if (real.length === 0) return null;
  const parts = real.map(describe);
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
  const local = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timeZone ?? 'UTC',
    }).format(now),
  );
  return local === hour;
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
    .select('id, digest_hour, digest_sent_at, timezone')
    .eq('digest_enabled', true);

  let sent = 0;
  for (const person of people ?? []) {
    const timeZone = (person.timezone as string | null) ?? null;
    if (!isDigestHour(now, person.digest_hour as number, timeZone)) continue;
    if (!isDueForDigest(now, (person.digest_sent_at as string | null) ?? null)) continue;

    const { data: rows } = await admin.rpc('digest_items', { p_user: person.id });
    const body = digestBody(
      (rows ?? []).map((row: { kind: string; items: number; latest_title: string | null }) => ({
        kind: row.kind,
        items: row.items,
        latestTitle: row.latest_title,
      })),
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
      // Rides the existing per-category preference rather than inventing a
      // second mute: someone who muted plans should not be sent a summary of
      // their plans through a side door.
      undefined,
    );
    sent += 1;
  }
  return sent;
}
