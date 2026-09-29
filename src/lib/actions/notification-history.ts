'use server';

import { validation, type ActionResult } from '@/lib/errors';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

// Kept apart from notifications.ts on purpose: that file's clear and
// mark-read actions must never carry a row limit (notification-badge.test.ts),
// and a paged read necessarily does.

/** One page of the feed; the page itself shows the newest page. */
const OLDER_PAGE_SIZE = 20;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FeedPageRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface OlderNotificationsResult extends ActionResult {
  notifications?: FeedPageRow[];
  hasMore?: boolean;
}

/**
 * The page of notifications older than the one the reader is looking at.
 *
 * The feed used to stop at the newest 20, so anything older was unreachable
 * even though "Mark all as read" counted it. Keyed by (created_at, id) rather
 * than an offset, so rows arriving at the top while someone scrolls cannot
 * shift the next page and repeat or skip one.
 */
export async function loadOlderNotifications(
  beforeCreatedAt: string,
  beforeId: string,
): Promise<OlderNotificationsResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!TIMESTAMP.test(beforeCreatedAt) || !UUID.test(beforeId)) {
    return validation('Reload the page to see older notifications.');
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, url, read_at, created_at')
    .eq('user_id', user.id)
    // Quoted: a timestamp carries the `:` and `.` PostgREST reads as syntax.
    .or(
      `created_at.lt."${beforeCreatedAt}",and(created_at.eq."${beforeCreatedAt}",id.lt.${beforeId})`,
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(OLDER_PAGE_SIZE + 1);
  if (error) {
    return reportAndFail('SB-NOTIFY-LOAD', 'notifications.load', error, { stage: 'older' });
  }
  const rows = data ?? [];
  return {
    ok: true,
    notifications: rows.slice(0, OLDER_PAGE_SIZE),
    hasMore: rows.length > OLDER_PAGE_SIZE,
  };
}
