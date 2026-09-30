'use server';

import { failure, validation, type ErrorCode } from '@/lib/errors';

import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { safeFetchText } from '@/lib/server/safe-fetch';
import { isFetchableUrl } from '@/lib/net-guard';
import { reportAndFail } from '@/lib/server/observability';
import { parseEvent, isoToDateTimeParts } from '@/lib/import-event';
import { isValidTimeZone } from '@/lib/server/event-zone';

export interface ImportResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  locationName?: string;
}

const MAX_BYTES = 1_500_000; // don't slurp huge pages

/**
 * The wizard's date and time fields for an imported start, in the host's zone.
 *
 * A start with an offset ("…T19:00:00-07:00", what Luma and Eventbrite publish)
 * is an instant, so it is shown in the host's own zone; formatting it here used
 * the server's UTC and a 7pm Pacific plan arrived as 2am the next day. A start
 * with no offset is already a wall-clock time and is taken literally.
 */
function wizardStart(
  startISO: string | undefined,
  timeZone: string | null | undefined,
): { date?: string; time?: string } {
  if (!startISO) return {};
  const instant = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(startISO);
  if (!instant && /^\d{4}-\d{2}-\d{2}/.test(startISO)) {
    return { date: startISO.slice(0, 10), time: startISO.slice(11, 16) || undefined };
  }
  return isoToDateTimeParts(startISO, isValidTimeZone(timeZone) ? timeZone : undefined);
}

/**
 * Import a plan the user made elsewhere: fetch the link they paste and pull out
 * the event via schema.org/Event JSON-LD, Open Graph, or an .ics. User-initiated
 * migration of their own event - not scraping - so it's gated behind auth and
 * rate-limited, and only ever returns fields to prefill the wizard.
 */
export async function importEventFromLink(
  rawUrl: string,
  /** The host's own zone, from the browser, so an imported time reads as theirs. */
  timeZone?: string | null,
): Promise<ImportResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;

  // Checked and fetched through the shared network guard. This used to be a
  // bare `fetch` with `redirect: 'follow'`, which made it a server-side request
  // forgery hole: any pasted link — or any public link that redirected — could
  // steer our server at `127.0.0.1` or at the cloud metadata endpoint that
  // hands out role credentials. The guard resolves the host, refuses private
  // addresses, and re-checks every redirect hop.
  const checked = isFetchableUrl(rawUrl);
  if (!checked.ok) {
    return validation(
        checked.reason === 'private'
          ? 'That address is on a private network, so there’s nothing there to import.'
          : 'That doesn’t look like a link.',
    );
  }

  if (!(await checkRateLimit(`import:${user.id}`, 20, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'Too many imports. Try again in a bit.');
  }

  const fetched = await safeFetchText(checked.url.toString(), {
    maxBytes: MAX_BYTES,
    // Some hosts serve richer metadata to link-unfurlers.
    accept: 'text/html,text/calendar,application/xhtml+xml',
  });
  if (!fetched.ok || fetched.body === undefined) {
    if (fetched.reason === 'private') {
      return validation(
        'That address is on a private network, so there’s nothing there to import.',
      );
    }
    return reportAndFail(
      'SB-IMPORT-READ',
      'event.import',
      new Error(`safe fetch failed: ${fetched.reason ?? 'unknown'}`),
    );
  }
  const content = fetched.body;
  const contentType = fetched.contentType ?? '';

  const parsed = parseEvent(content, contentType);
  if (!parsed || (!parsed.title && !parsed.startISO)) {
    return validation('We couldn’t find an event on that page.');
  }

  const { date, time } = wizardStart(parsed.startISO, timeZone);
  return {
    ok: true,
    title: parsed.title,
    description: parsed.description,
    date,
    time,
    locationName: parsed.locationName,
  };
}
