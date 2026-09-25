import 'server-only';

import webPush from 'web-push';
import { supportEmail } from '@/lib/contact';
import { mapInBatches } from '@/lib/server/batches';
import { createAdminClient } from '@/lib/supabase/admin';
import { reportOperationalError } from '@/lib/server/observability';
import {
  categoryForKind,
  columnForCategory,
  type NotificationCategory,
} from '@/lib/notifications';

/** Per-endpoint ceiling for a push delivery; web-push aborts the request past it. */
const WEB_PUSH_TIMEOUT_MS = 10_000;
/** Concurrent push deliveries in flight; the same shape as the email fan-out. */
const WEB_PUSH_BATCH_SIZE = 10;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface NotificationPayload extends PushPayload {
  urgentUntil?: string;
  /** Coarse category, e.g. 'connection_accepted', 'match', 'reminder'. */
  kind: string;
}

export interface NotificationDeliveryResult {
  recorded: boolean;
}

/**
 * The unified notification path: record a durable in-app notification for each
 * user AND push it. The in-app row is the reliable surface — always written,
 * independent of quiet hours, visible even to users who never enabled push — so
 * nothing that matters is push-only. The push is best-effort on top. Use this
 * instead of sendPushToUsers for anything a user should find later in
 * /notifications.
 */
export async function notifyUsers(
  userIds: string[],
  payload: NotificationPayload,
): Promise<NotificationDeliveryResult> {
  const ids = [...new Set(userIds)].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { recorded: false };

  const admin = createAdminClient();
  const { error } = await admin.from('notifications').insert(
    ids.map((user_id) => ({
      user_id,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      url: payload.url ?? null,
      ...(payload.urgentUntil ? { urgent_until: payload.urgentUntil } : {}),
    })),
  );
  // In-app recording is best-effort — never block the domain action on it.
  if (error) {
    await reportOperationalError(
      'notify.record',
      error,
      { kind: payload.kind, recipients: ids.length },
      'SB-NOTIFY-RECORD',
    );
  }

  // The push honors the recipient's per-category preference; the in-app row
  // above is always written regardless, so muting a category loses the buzz,
  // never the history.
  await sendPushToUsers(
    ids,
    {
      title: payload.title,
      body: payload.body,
      url: payload.url,
    },
    categoryForKind(payload.kind) ?? undefined,
  );
  return { recorded: !error };
}

/** Record at most one unread room alert per recipient every 30 minutes. */
export async function notifyRoomActivity(
  roomId: string,
  roomTitle: string,
  senderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const activeThreshold = new Date(Date.now() - 90_000).toISOString();
  const { data: members } = await admin
    .from('room_members')
    .select('member_id, last_read_at')
    .eq('room_id', roomId)
    .neq('member_id', senderId);
  const recipients = (members ?? [])
    .filter((m) => !m.last_read_at || m.last_read_at < activeThreshold)
    .map((m) => m.member_id);
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  await Promise.all(
    recipients.map(async (recipientId) => {
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', recipientId)
        .eq('kind', 'room_message')
        .eq('url', `/rooms/${roomId}`)
        .is('read_at', null)
        .gte('created_at', cutoff)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await admin
          .from('notifications')
          .update({
            title: `New messages in ${roomTitle}`,
            body: 'There’s new activity in this room.',
            created_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        return;
      }

      await notifyUsers([recipientId], {
        kind: 'room_message',
        title: `New message in ${roomTitle}`,
        body: 'Open the room to catch up.',
        url: `/rooms/${roomId}`,
      });
    }),
  );
}

/**
 * How long a burst of new ideas collapses into a single alert.
 *
 * Suggestions do not arrive one an hour; they arrive five in two minutes while
 * a group brainstorms. One push per idea is exactly the flood that makes people
 * mute a category forever, so within this window we rewrite the standing unread
 * alert in place — the feed row stays accurate and the phone buzzes once. Same
 * device as notifyRoomActivity, for the same reason.
 */
export const SUGGESTION_COALESCE_WINDOW_MS = 30 * 60 * 1000;

/**
 * The copy for a "new idea" alert, given how many ideas it stands for. Pure so
 * the singular/plural split is testable without a database.
 *
 * It never names who suggested the idea. `poll_options` doesn't record an
 * author and the poll UI doesn't show one, so putting a name in the push would
 * make the notification the only place that reveals who proposed what — a leak
 * out the side door of a deliberately anonymous surface.
 */
export function suggestionNotice(
  eventTitle: string,
  label: string,
  count: number,
): PushPayload {
  if (count > 1) {
    return {
      title: `${count} new ideas · ${eventTitle}`,
      body: `Latest: “${label}”. Open the plan to rank them.`,
    };
  }
  return {
    title: `New idea · ${eventTitle}`,
    body: `“${label}” — open the plan to rank it.`,
  };
}

/**
 * Tell the people already invested in a poll that there's something new to rank.
 *
 * Recipients are the ones for whom this is news they can act on: everyone who
 * has already cast a vote (they ranked a list that just changed under them),
 * plus the host and co-hosts. Never the person who just suggested it. Guests who
 * haven't voted yet aren't chased — they'll see the full list whenever they
 * first open the plan, and pushing at them turns a poll into a pestering.
 *
 * Reading `poll_votes` here is a membership read, never a ballot read: only
 * `voter_id` is selected, never `option_id` or `weight`, and the result decides
 * who to notify rather than being shown to anyone. The anonymity invariant
 * (aggregates only, never raw votes) is untouched — no recipient learns anything
 * about anyone else's vote, including that they voted.
 *
 * Best-effort throughout; a failure here must never cost the suggestion itself.
 */
export async function notifySuggestionAdded(
  pollId: string,
  eventId: string,
  label: string,
  suggesterId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select('id, title, host_id')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return;

  const [{ data: cohosts }, { data: voters }] = await Promise.all([
    admin.from('event_cohosts').select('cohost_id').eq('event_id', eventId),
    admin.from('poll_votes').select('voter_id').eq('poll_id', pollId),
  ]);

  const recipients = new Set<string>([event.host_id]);
  for (const row of cohosts ?? []) {
    if (row.cohost_id) recipients.add(row.cohost_id);
  }
  for (const row of voters ?? []) {
    if (row.voter_id) recipients.add(row.voter_id);
  }
  recipients.delete(suggesterId);
  if (recipients.size === 0) return;

  const cutoff = new Date(Date.now() - SUGGESTION_COALESCE_WINDOW_MS);
  const url = `/events/${event.id}`;

  // How many ideas the window now covers — used only when folding into a
  // standing alert, so the digest counts every idea that alert stands for.
  const { count: recentCount } = await admin
    .from('poll_options')
    .select('id', { count: 'exact', head: true })
    .eq('poll_id', pollId)
    .gte('created_at', cutoff.toISOString());

  await Promise.all(
    [...recipients].map(async (recipientId) => {
      const { data: standing } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', recipientId)
        .eq('kind', 'poll_suggestion')
        .eq('url', url)
        .is('read_at', null)
        .gte('created_at', cutoff.toISOString())
        .limit(1)
        .maybeSingle();

      if (standing) {
        // Fold in: refresh the wording and float it back to the top of the
        // feed, but deliberately do NOT push again — one buzz per burst.
        const notice = suggestionNotice(event.title, label, recentCount ?? 2);
        await admin
          .from('notifications')
          .update({
            title: notice.title,
            body: notice.body,
            created_at: new Date().toISOString(),
          })
          .eq('id', standing.id);
        return;
      }

      // Nothing standing — this idea is news on its own terms, so describe it
      // alone rather than as part of a digest the reader never saw.
      const notice = suggestionNotice(event.title, label, 1);
      await notifyUsers([recipientId], {
        kind: 'poll_suggestion',
        title: notice.title,
        body: notice.body,
        url,
      });
    }),
  );
}

/**
 * How many accepted connections the recipient must have before we send the
 * anonymous "someone's down to connect" nudge.
 *
 * The nudge deliberately never names the sender — but only a connection can
 * express down-to-connect interest, so the recipient's connection set IS the
 * sender's anonymity set. With one or two connections, "someone is interested"
 * trivially points at a single person, which would break the mutual-mode
 * anonymity invariant (a target must not learn about unrequited interest). Below
 * this floor we stay silent; the invariant wins over the nudge.
 */
export const MIN_CONNECTIONS_FOR_INTEREST_NUDGE = 3;

/**
 * Decide whether to send the anonymous interest nudge, given the recipient's
 * accepted-connection count and how many unread nudges they already have.
 *
 * Pure so the policy is unit-testable without a database:
 *  - the connection floor keeps the sender hidden in a crowd, and
 *  - one standing unread nudge at a time avoids spam and stops an idempotent
 *    re-submit of the same intent from re-buzzing the target.
 */
export function shouldSendInterestNudge(
  connectionCount: number,
  unreadNudgeCount: number,
): boolean {
  return (
    connectionCount >= MIN_CONNECTIONS_FOR_INTEREST_NUDGE &&
    unreadNudgeCount === 0
  );
}

/**
 * Anonymously nudge `targetId` that someone they're connected with expressed
 * one-sided interest in Mutual Mode, so they know it's worth opening the tab and
 * choosing people back. It NEVER reveals who expressed interest or the activity
 * — that would leak unrequited interest, which the whole feature is built to
 * hide. No-ops (silently) when the anonymity set is too small or a nudge is
 * already waiting; best-effort, never throws.
 */
export async function notifyInterestReceived(targetId: string): Promise<void> {
  if (!targetId) return;
  const admin = createAdminClient();

  const [{ count: connectionCount }, { count: unreadNudgeCount }] =
    await Promise.all([
      admin
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${targetId},addressee_id.eq.${targetId}`),
      admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetId)
        .eq('kind', 'interest_received')
        .is('read_at', null),
    ]);

  if (!shouldSendInterestNudge(connectionCount ?? 0, unreadNudgeCount ?? 0)) {
    return;
  }

  await notifyUsers([targetId], {
    kind: 'interest_received',
    title: '✨ Someone’s down to connect',
    body:
      'Someone you’re connected with is up for an activity with you. Open Mutual Mode and pick who you’re down to — if it lines up, you’ll both find out.',
    url: '/mutual',
  });
}

let vapidConfigured = false;

function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    webPush.setVapidDetails(`mailto:${supportEmail()}`, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

/** Is `now` inside the user's quiet hours (in their timezone)? */
export function isQuietTime(
  quietStart: number | null,
  quietEnd: number | null,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (quietStart === null || quietEnd === null) return false;
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      }).format(now),
    );
  } catch {
    hour = now.getUTCHours();
  }
  // Window may wrap midnight (e.g. 22 → 8).
  return quietStart <= quietEnd
    ? hour >= quietStart && hour < quietEnd
    : hour >= quietStart || hour < quietEnd;
}

/**
 * Push to a set of users, silently skipping anyone in quiet hours or who has
 * muted this category, and pruning dead subscriptions. Never throws -
 * notifications are best-effort.
 *
 * `category` gates the push against the recipient's per-category preference
 * (a `notify_*` column on their profile). Omit it — or pass a payload whose
 * `kind` isn't mapped to a category — and the push is always allowed.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  category?: NotificationCategory,
): Promise<void> {
  if (userIds.length === 0 || !configureVapid()) return;

  const prefColumn = category ? columnForCategory(category) : null;
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select(
      'id, quiet_hours_start, quiet_hours_end, timezone, notify_plans, notify_suggestions, notify_reminders, notify_messages, notify_social',
    )
    .in('id', userIds);

  const routedCategory = category === 'plans' || category === 'reminders' ? category : null;
  const { data: routes, error: routeError } = routedCategory
    ? await admin.from('notification_routes').select('user_id, plans, reminders').in('user_id', userIds)
    : { data: [], error: null };
  if (routeError) throw new Error('Notification routing unavailable');
  const routeByUser = new Map((routes ?? []).map(r => [r.user_id, r]));
  const awake = (profiles ?? [])
    .filter(p => !routedCategory || ['existing', 'push'].includes(routeByUser.get(p.id)?.[routedCategory] ?? 'existing'))
    .filter(
      (p) => !isQuietTime(p.quiet_hours_start, p.quiet_hours_end, p.timezone),
    )
    // A muted category opts out of the push. Default-on: only an explicit
    // `false` suppresses, so a null (pre-migration row) still notifies.
    .filter((p) => !prefColumn || p[prefColumn] !== false)
    .map((p) => p.id);
  if (awake.length === 0) return;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', awake);

  // Push endpoints are third-party servers: bound the fan-out like every
  // other provider call so one hung endpoint cannot pin a cron sweep.
  await mapInBatches(
    subs ?? [],
    async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { timeout: WEB_PUSH_TIMEOUT_MS },
        );
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          return;
        }
        await reportOperationalError('push.send', error, {
          subscriptionId: sub.id,
          statusCode: statusCode ?? null,
        });
      }
    },
    WEB_PUSH_BATCH_SIZE,
  );
}
