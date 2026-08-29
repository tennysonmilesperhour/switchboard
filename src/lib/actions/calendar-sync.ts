'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/lib/errors';
import { failure } from '@/lib/errors';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
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
  /** End of the week the last successful read actually covered. */
  coveredThrough: string | null;
  /** A calendar that is connected AND last read cleanly. */
  usable: boolean;
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
): Promise<
  | { ok: true; slots: number; coveredThrough: string }
  | { ok: false; status: string; code: 'SB-CAL-FETCH' | 'SB-CAL-READ' | 'SB-CAL-SAVE' }
> {
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
  //
  // Both writes are checked. They were not, and the cost was the worst kind of
  // failure: the delete would land, the insert would fail, and the person would
  // be told "connected, 9 busy slots" over an empty table — then shown a grid
  // claiming their whole week was free.
  const { error: clearError } = await supabase
    .from('calendar_busy')
    .delete()
    .eq('user_id', userId);
  if (clearError) return { ok: false, status: 'unsaved', code: 'SB-CAL-SAVE' };

  if (busy.length > 0) {
    const { error: insertError } = await supabase
      .from('calendar_busy')
      .insert(busy.map((slot) => ({ user_id: userId, slot })));
    if (insertError) return { ok: false, status: 'unsaved', code: 'SB-CAL-SAVE' };
  }
  return { ok: true, slots: busy.length, coveredThrough: windowEnd.toISOString() };
}

/**
 * The stored feed address, read with the service role.
 *
 * `revoke select (ics_url)` keeps this column away from every `authenticated`
 * session, which includes the server actions' own session client — that is the
 * point, since it is also what the person's browser holds. Reading it therefore
 * needs the admin client, and per docs/SECURITY.md every admin-client call
 * re-authorizes the specific caller and resource: the caller is already
 * authenticated above, and the query is pinned to their own row.
 */
async function readSubscriptionUrl(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('calendar_subscriptions')
    .select('ics_url')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.ics_url ?? null;
}

/**
 * Write this person's subscription row, service-role, caller re-authorized.
 *
 * The session client cannot do it. Withholding SELECT on the table is what
 * keeps `ics_url` away from the browser, and `insert ... on conflict do update`
 * needs SELECT on the table it is updating — so an upsert from the owner's own
 * session is refused outright. That is the grant working as intended rather
 * than a reason to loosen it: the credential is written on the server, by the
 * only role allowed to see it, pinned to the caller's own row.
 */
async function writeSubscription(
  userId: string,
  fields: Record<string, string | null>,
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('calendar_subscriptions')
    .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' });
  return !error;
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

  const saved = await writeSubscription(user.id, {
    ics_url: url,
    source_host: checked.url.hostname,
    last_synced_at: new Date().toISOString(),
    last_status: result.ok ? 'ok' : result.status,
    // Null on failure, so a connection that never read anything cannot look
    // like one that covered the week.
    covered_through: result.ok ? result.coveredThrough : null,
  });
  if (!saved) {
    return reportAndFail('SB-CAL-SAVE', 'calendar.connect', new Error('subscription write failed'));
  }

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
  const storedUrl = await readSubscriptionUrl(user.id);
  if (!storedUrl) return failure('SB-CAL-GONE');

  const result = await refreshBusy(supabase, user.id, storedUrl);
  await writeSubscription(user.id, {
    ics_url: storedUrl,
    last_synced_at: new Date().toISOString(),
    last_status: result.ok ? 'ok' : result.status,
    covered_through: result.ok ? result.coveredThrough : null,
  });

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
const EMPTY_STATUS: CalendarStatus = {
  connected: false,
  sourceHost: null,
  lastSyncedAt: null,
  lastStatus: null,
  coveredThrough: null,
  usable: false,
};

export async function getCalendarStatus(): Promise<CalendarStatus> {
  const auth = await requireUser();
  if (!auth.ok) return EMPTY_STATUS;
  const { data } = await auth.supabase.rpc('calendar_subscription_status');
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return EMPTY_STATUS;
  const coveredThrough = row.covered_through ?? null;
  return {
    connected: true,
    sourceHost: row.source_host ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    lastStatus: row.last_status ?? null,
    coveredThrough,
    // Connected is not the same as answered. A calendar whose last read failed
    // has no busy times stored, and offering to fill from it would tick the
    // whole week as free — telling the group this person is available when
    // nothing has actually been checked.
    usable: row.last_status === 'ok' && Boolean(coveredThrough),
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
