'use server';

import type { ErrorCode } from '@/lib/errors';

import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { parseEvent, isoToDateTimeParts } from '@/lib/import-event';

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
 * Import a plan the user made elsewhere: fetch the link they paste and pull out
 * the event via schema.org/Event JSON-LD, Open Graph, or an .ics. User-initiated
 * migration of their own event - not scraping - so it's gated behind auth and
 * rate-limited, and only ever returns fields to prefill the wizard.
 */
export async function importEventFromLink(rawUrl: string): Promise<ImportResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'That doesn’t look like a link.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http(s) links can be imported.' };
  }

  if (!(await checkRateLimit(`import:${user.id}`, 20, 60 * 60))) {
    return { ok: false, error: 'Too many imports. Try again in a bit.' };
  }

  let content: string;
  let contentType = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Some hosts serve richer metadata to link-unfurlers.
        'User-Agent': 'SwitchboardBot/1.0 (+https://switchboard.app)',
        Accept: 'text/html,text/calendar,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!response.ok) {
      return { ok: false, error: 'We couldn’t open that link.' };
    }
    contentType = response.headers.get('content-type') ?? '';
    const buffer = await response.arrayBuffer();
    content = new TextDecoder().decode(buffer.slice(0, MAX_BYTES));
  } catch {
    return { ok: false, error: 'We couldn’t read that link - just fill the plan in below.' };
  }

  const parsed = parseEvent(content, contentType);
  if (!parsed || (!parsed.title && !parsed.startISO)) {
    return { ok: false, error: 'We couldn’t find an event on that page.' };
  }

  const { date, time } = isoToDateTimeParts(parsed.startISO);
  return {
    ok: true,
    title: parsed.title,
    description: parsed.description,
    date,
    time,
    locationName: parsed.locationName,
  };
}
