import webPush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface NotificationPayload extends PushPayload {
  /** Coarse category, e.g. 'connection_accepted', 'match', 'reminder'. */
  kind: string;
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
): Promise<void> {
  const ids = [...new Set(userIds)].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin.from('notifications').insert(
    ids.map((user_id) => ({
      user_id,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      url: payload.url ?? null,
    })),
  );
  // In-app recording is best-effort — never block the domain action on it.
  if (error) console.error('[notify:record]', error.message);

  await sendPushToUsers(ids, {
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });
}

let vapidConfigured = false;

function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    webPush.setVapidDetails('mailto:hello@switchboard.app', publicKey, privateKey);
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
 * Push to a set of users, silently skipping anyone in quiet hours and
 * pruning dead subscriptions. Never throws - notifications are best-effort.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0 || !configureVapid()) return;

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, quiet_hours_start, quiet_hours_end, timezone')
    .in('id', userIds);

  const awake = (profiles ?? [])
    .filter(
      (p) => !isQuietTime(p.quiet_hours_start, p.quiet_hours_end, p.timezone),
    )
    .map((p) => p.id);
  if (awake.length === 0) return;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', awake);

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }),
  );
}
