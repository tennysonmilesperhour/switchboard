import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { clientIpFromHeaders } from '@/lib/server/request-ip';
import { reportOperationalError } from '@/lib/server/observability';
import { notifyProgress } from '@/lib/server/scope-watch';
import { codeForArea } from '@/lib/errors';
import { isScopeItemId, SCOPE_ITEM_IDS } from '@/lib/scope-checklist';

/**
 * The scope checklist's shared board: what is ticked, and what people wrote.
 *
 * **This endpoint is public on purpose, for reading as well as writing.** The
 * owner's requirement was that the checklist not be account-gated — anyone
 * holding the URL should see the progress and the notes — and `GET` here is
 * what makes that true. It was offered as a choice with a token-protected
 * alternative and the open version was chosen deliberately; the reasoning and
 * what it exposes are written down in `docs/SECURITY.md`.
 *
 * So treat everything this returns as published. Note text, reporter names and
 * screenshots are all readable by anyone who requests this path, including
 * crawlers. The one thing it does not do is hand out a listable bucket:
 * screenshots come back as freshly signed URLs, minted per request, so the
 * objects are reachable but the store is not enumerable.
 *
 * RLS on both tables stays closed with no policies. Every read and write goes
 * through here, which is what keeps the rate limits un-bypassable — a client
 * that could talk to Postgres directly would not have to ask us first.
 */

const SIGNED_URL_SECONDS = 3600;
const MAX_NOTES = 200;
const MAX_ITEM_ID = 16;
const MAX_NAME = 80;

/** Reads are cheap and idempotent, but still bounded against a hammering. */
const READ_LIMIT = 120;
const READ_WINDOW_SECONDS = 60 * 10;
/** Writes are one tick each; a person walking the list makes a few dozen. */
const WRITE_LIMIT = 200;
const WRITE_WINDOW_SECONDS = 60 * 60;
const WRITE_GLOBAL_LIMIT = 2000;
const WRITE_GLOBAL_WINDOW_SECONDS = 24 * 60 * 60;

function fail(message: string, status: number, code?: string) {
  return NextResponse.json(code ? { error: message, code } : { error: message }, {
    status,
  });
}

function text(value: FormDataEntryValue | string | null, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export async function GET(request: Request) {
  if (!hasAdminCredentials()) {
    return fail(
      'The shared checklist isn’t switched on for this deployment yet.',
      503,
      codeForArea('scope-progress'),
    );
  }

  const ip = clientIpFromHeaders(request.headers) || 'unknown';
  if (
    !(await checkRateLimit(
      `scope-progress:read:${ip}`,
      READ_LIMIT,
      READ_WINDOW_SECONDS,
    ))
  ) {
    return fail('Too many requests. Try again shortly.', 429);
  }

  const admin = createAdminClient();

  const [progressResult, notesResult] = await Promise.all([
    admin
      .from('scope_progress')
      .select('item_id, checked, updated_at, updated_by')
      .eq('checked', true),
    admin
      .from('client_feedback')
      .select(
        'id, created_at, item_id, item_label, body, reporter, screenshots, status, resolution',
      )
      .order('created_at', { ascending: false })
      .limit(MAX_NOTES),
  ]);

  if (progressResult.error || notesResult.error) {
    await reportOperationalError(
      'scope-progress',
      progressResult.error ?? notesResult.error,
      { stage: 'read' },
    );
    return fail(
      'Couldn’t load the checklist.',
      500,
      codeForArea('scope-progress'),
    );
  }

  const checked: Record<string, { at: string; by: string | null }> = {};
  for (const row of progressResult.data ?? []) {
    if (!isScopeItemId(row.item_id)) continue;
    checked[row.item_id] = { at: row.updated_at, by: row.updated_by };
  }

  // Signed per request rather than made public, so the objects are viewable
  // without the bucket being listable.
  const notes = await Promise.all(
    (notesResult.data ?? []).map(async (row) => {
      const screenshots = await Promise.all(
        (row.screenshots ?? []).map(async (path: string) => {
          const { data } = await admin.storage
            .from('client-feedback')
            .createSignedUrl(path, SIGNED_URL_SECONDS);
          return data?.signedUrl ?? null;
        }),
      );
      return {
        id: row.id,
        at: row.created_at,
        itemId: row.item_id,
        itemLabel: row.item_label,
        body: row.body,
        reporter: row.reporter,
        status: row.status,
        resolution: row.resolution,
        screenshots: screenshots.filter((url): url is string => Boolean(url)),
      };
    }),
  );

  return NextResponse.json(
    { ok: true, checked, notes },
    {
      headers: {
        // Always the live board. A cached copy here would recreate the exact
        // complaint this endpoint exists to answer.
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}

export async function POST(request: Request) {
  if (!hasAdminCredentials()) {
    return fail(
      'The shared checklist isn’t switched on for this deployment yet.',
      503,
      codeForArea('scope-progress'),
    );
  }

  const ip = clientIpFromHeaders(request.headers) || 'unknown';
  // Fail closed on both: an unavailable limiter must not turn an open write
  // endpoint into an unlimited one.
  if (
    !(await checkRateLimit(
      'scope-progress:write:all',
      WRITE_GLOBAL_LIMIT,
      WRITE_GLOBAL_WINDOW_SECONDS,
      { failClosed: true },
    ))
  ) {
    return fail('Too many changes at once. Try again later.', 429);
  }
  if (
    !(await checkRateLimit(
      `scope-progress:write:${ip}`,
      WRITE_LIMIT,
      WRITE_WINDOW_SECONDS,
      { failClosed: true },
    ))
  ) {
    return fail('That’s a lot of changes. Try again in a bit.', 429);
  }

  let payload: {
    itemId?: unknown;
    checked?: unknown;
    name?: unknown;
    /** Accepted for older pages; the server always uses its own scope total. */
    total?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return fail('Expected a JSON body.', 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail('Expected a checklist change.', 400);
  }

  const itemId = text(
    typeof payload.itemId === 'string' ? payload.itemId : null,
    MAX_ITEM_ID,
  ).toUpperCase();
  if (!isScopeItemId(itemId)) {
    return fail('That isn’t a checklist item.', 400);
  }
  if (typeof payload.checked !== 'boolean') {
    return fail('Say whether it is checked or not.', 400);
  }
  const name = text(typeof payload.name === 'string' ? payload.name : null, MAX_NAME);

  const admin = createAdminClient();
  const { error } = await admin.from('scope_progress').upsert(
    {
      item_id: itemId,
      checked: payload.checked,
      updated_at: new Date().toISOString(),
      updated_by: name || null,
    },
    { onConflict: 'item_id' },
  );

  if (error) {
    await reportOperationalError('scope-progress', error, {
      stage: 'write',
      itemId,
    });
    return fail(
      'That didn’t save.',
      500,
      codeForArea('scope-progress'),
    );
  }

  // Tell the owner, at most once an hour. Never let this fail the write.
  try {
    const { count } = await admin
      .from('scope_progress')
      .select('item_id', { count: 'exact', head: true })
      .in('item_id', SCOPE_ITEM_IDS)
      .eq('checked', true);
    await notifyProgress({
      checked: count ?? 0,
      total: SCOPE_ITEM_IDS.length,
      lastBy: name || null,
    });
  } catch (error) {
    await reportOperationalError('scope-progress', error, { stage: 'notify' });
  }

  return NextResponse.json({ ok: true, itemId, checked: payload.checked });
}
