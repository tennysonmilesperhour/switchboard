'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/lib/errors';
import { failure } from '@/lib/errors';
import { requireUser } from '@/lib/server/require-user';
import type { createClient } from '@/lib/supabase/server';
import { reportAndFail } from '@/lib/server/observability';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { safeFetchText } from '@/lib/server/safe-fetch';
import { isFetchableUrl } from '@/lib/net-guard';
import { parseBusyIntervals, busyGridSlots } from '@/lib/ics-busy';
import { GRID_DAYS, gridSlots, slotRange } from '@/lib/availability';

/**
 * Connecting a calendar so the availability grid starts from your real week.
 *
 * Phase 1 of docs/INNOVATIONS.md #9, deliberately without OAuth: every calendar
 * worth connecting already publishes a read-only iCalendar URL, which means this
 * works for Google, Outlook and iCloud users alike and ships without waiting on
 * app verification for a sensitive Google scope.
 *
 * The URL is a bearer credential — anyone holding it can read the whole
 * calendar — so it is written once and never read back out to the client. Every
 * fetch happens here, on the server, through the SSRF guard, because a URL a
 * user pastes is a URL an attacker can paste.
 */

export interface CalendarStatus {
  connected: boolean;
  sourceHost: string | null;
  lastSyncedAt: string | null;
  lastStatus: string | null;
}

/** How much calendar to read. Generous for a week's grid, far short of a slurp. */
const MAX_ICS_BYTES = 2_000_000;

/**
 * Fetch a feed and turn it into this person's busy bands.
 *
 * Shared by connect and sync so the two can never disagree about what a feed
 * means — the difference between them is only where the URL came from.
 */
async function refreshBusy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  url: string,
): Promise<{ ok: true; slots: number } | { ok: false; status: string; code: 'SB-CAL-FETCH' | 'SB-CAL-READ' }> {
  const fetched = await safeFetchText(url, { maxBytes: MAX_ICS_BYTES, accept: 'text/calendar,*/*' });
  if (!fetched.ok || !fetched.body) {
    return {
      ok: false,
      status: fetched.reason === 'private' ? 'refused' : 'unreachable',
      code: 'SB-CAL-FETCH',
    };
  }
  if (!fetched.body.toUpperCase().includes('BEGIN:VCALENDAR')) {
    // A link that resolves to a login page is the common case here, and saying
    // "we couldn't read a calendar there" is more use than a parse error.
    return { ok: false, status: 'unreadable', code: 'SB-CAL-READ' };
  }

  const now = new Date();
  const slots = gridSlots(now, GRID_DAYS);
  const windowStart = new Date(slots[0]);
  const windowEnd = new Date(slotRange(slots[slots.length - 1]).end);
  const busy = busyGridSlots(
    parseBusyIntervals(fetched.body, windowStart, windowEnd),
    slots,
    slotRange,
  );

  // Replace rather than merge: the calendar is the source of truth for these
  // rows, and a meeting that was cancelled since the last sync has to be able
  // to disappear. Scoped to this user, whom RLS also confines us to.
  await supabase.from('calendar_busy').delete().eq('user_id', userId);
  if (busy.length > 0) {
    await supabase
      .from('calendar_busy')
      .insert(busy.map((slot) => ({ user_id: userId, slot })));
  }
  return { ok: true, slots: busy.length };
}

/** Save a calendar feed and read it for the first time. */
export async function connectCalendar(rawUrl: string): Promise<ActionResult & { slots?: number }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const checked = isFetchableUrl(rawUrl);
  if (!checked.ok) {
    // Validation, so no code: the sentence already names the cause and the fix,
    // and a reference number beside it would only teach people to ignore them.
    return {
      ok: false,
      error:
        checked.reason === 'private'
          ? 'That address is on a private network, so it isn’t a calendar Switchboard can reach.'
          : 'That doesn’t look like a calendar link. Copy the secret iCal address from your calendar’s settings.',
    };
  }

  if (!(await checkRateLimit(`calendar-connect:${user.id}`, 10, 60 * 60))) {
    return { ok: false, error: 'Give it a moment before trying another calendar.' };
  }

  const url = checked.url.toString();
  const result = await refreshBusy(supabase, user.id, url);

  const { error } = await supabase.from('calendar_subscriptions').upsert(
    {
      user_id: user.id,
      ics_url: url,
      source_host: checked.url.hostname,
      last_synced_at: new Date().toISOString(),
      last_status: result.ok ? 'ok' : result.status,
    },
    { onConflict: 'user_id' },
  );
  if (error) return reportAndFail('SB-CAL-SAVE', 'calendar.connect', error);

  revalidatePath('/settings');
  if (!result.ok) return failure(result.code);
  return { ok: true, slots: result.slots };
}

/** Re-read the calendar already connected. */
export async function syncCalendar(): Promise<ActionResult & { slots?: number }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`calendar-sync:${user.id}`, 30, 60 * 60))) {
    return { ok: false, error: 'That calendar was just checked. Try again shortly.' };
  }

  // The one place the stored URL is read, and it stays inside this function.
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .select('ics_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return reportAndFail('SB-CAL-SAVE', 'calendar.sync', error);
  if (!data?.ics_url) return failure('SB-CAL-GONE');

  const result = await refreshBusy(supabase, user.id, data.ics_url);
  await supabase
    .from('calendar_subscriptions')
    .update({
      last_synced_at: new Date().toISOString(),
      last_status: result.ok ? 'ok' : result.status,
    })
    .eq('user_id', user.id);

  revalidatePath('/settings');
  if (!result.ok) return failure(result.code);
  return { ok: true, slots: result.slots };
}

/** Forget the calendar and everything derived from it. */
export async function disconnectCalendar(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Busy bands first: if the second delete fails, what remains is a connection
  // with no derived data, which the next sync repairs. The other order would
  // leave busy bands with nothing explaining where they came from.
  const { error: busyError } = await supabase
    .from('calendar_busy')
    .delete()
    .eq('user_id', user.id);
  if (busyError) return reportAndFail('SB-CAL-SAVE', 'calendar.disconnect', busyError);

  const { error } = await supabase
    .from('calendar_subscriptions')
    .delete()
    .eq('user_id', user.id);
  if (error) return reportAndFail('SB-CAL-SAVE', 'calendar.disconnect', error);

  revalidatePath('/settings');
  return { ok: true };
}

/** What the app may know about the connection — never the URL. */
export async function getCalendarStatus(): Promise<CalendarStatus> {
  const auth = await requireUser();
  if (!auth.ok) return { connected: false, sourceHost: null, lastSyncedAt: null, lastStatus: null };
  const { data } = await auth.supabase.rpc('calendar_subscription_status');
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { connected: false, sourceHost: null, lastSyncedAt: null, lastStatus: null };
  return {
    connected: true,
    sourceHost: row.source_host ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    lastStatus: row.last_status ?? null,
  };
}

/**
 * This person's busy bands for the week the grid covers.
 *
 * Read straight from the stored rows rather than re-fetching the feed, so
 * opening a plan never waits on somebody's calendar provider. Refreshing is an
 * explicit act in Settings, and stale-by-a-few-hours is the right trade for a
 * grid that appears instantly.
 *
 * Returns an empty list for anyone with no calendar connected, which is what
 * makes every caller's handling of "not connected" identical to "nothing on".
 */
export async function myBusySlots(): Promise<string[]> {
  const auth = await requireUser();
  if (!auth.ok) return [];
  const { supabase, user } = auth;

  const slots = gridSlots(new Date(), GRID_DAYS);
  const { data } = await supabase
    .from('calendar_busy')
    .select('slot')
    .eq('user_id', user.id);

  // Normalised through the grid's own slot list: Postgres hands back a
  // timestamptz whose formatting need not match the ISO strings the grid keys
  // on, and a near-miss would silently prefill nothing.
  const stored = new Set((data ?? []).map((row: { slot: string }) => new Date(row.slot).getTime()));
  return slots.filter((slot) => stored.has(new Date(slot).getTime()));
}
