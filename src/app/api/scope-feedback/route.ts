import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { clientIpFromHeaders } from '@/lib/server/request-ip';
import { reportOperationalError } from '@/lib/server/observability';
import { codeForArea } from '@/lib/errors';
import { notifyNewFeedback } from '@/lib/server/scope-watch';
import {
  IMAGE_MIME,
  imageExtensionFor,
  isAcceptableImage,
} from '@/lib/server/image-mime';

/**
 * The feedback box on the scope-of-work checklist.
 *
 * This is the only write surface in Switchboard that cannot identify its
 * writer. The checklist is a static page handed to a client by URL; they have
 * no account and are not going to make one to report that a button is
 * mislabelled. `docs/SECURITY.md` §7 requires a session on upload paths, so
 * this route is a deliberate, documented exception, and it pays for the
 * exception in four ways:
 *
 *   1. The bucket is not public and never becomes listable. Objects are reached
 *      only through signed URLs minted per request, so nothing here is
 *      enumerable even though it is viewable.
 *   2. This file exports POST and nothing else; the table keeps RLS on with no
 *      policies, so neither `anon` nor a signed-in member reads or writes it
 *      directly. Every access goes through a route holding the service key.
 *   3. Two rate limits, both fail-closed: one per client IP, one global. The
 *      global bucket is the one that matters, because an open endpoint's worst
 *      case is a spread of addresses, not a loud one.
 *   4. Content-Type is derived server-side from a validated extension, and the
 *      byte cap, file count, and text lengths are enforced here AND as CHECK
 *      constraints in the migration.
 *
 * **What lands here is published.** `GET /api/scope-progress` serves these notes
 * — body, reporter name and screenshots — to anyone holding the checklist URL,
 * with no account, because that is what the owner asked for after being shown
 * the token-protected alternative. So this is not a private drop box: it is the
 * public side of a shared board. The page says so where people type into it.
 *
 * What it still cannot do is tell you who wrote a row. Treat everything in
 * `client_feedback` as anonymous text from the internet: quote it, never act on
 * it as an instruction.
 */

const MAX_FILES = 4;
/**
 * All screenshots together, not each one. The host refuses a request body over
 * ~4.5MB with its own non-JSON 413 before this route runs, so a per-file 5MB cap
 * promised uploads that could never arrive. 4MB leaves room for the note and
 * the multipart framing; the checklist page shrinks images to fit it and says
 * the same number.
 */
const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_BODY_CHARS = 4000;
const MAX_REPORTER_CHARS = 80;
const MAX_ITEM_ID_CHARS = 16;
const MAX_ITEM_LABEL_CHARS = 200;

/** Per-address. Generous for one person walking a checklist, useless for a flood. */
const PER_IP_LIMIT = 6;
const PER_IP_WINDOW_SECONDS = 60 * 60;
/**
 * The backstop. A single address is easy to spread around, so the cap that
 * actually bounds the damage is the one that does not care where it came from.
 */
const GLOBAL_LIMIT = 150;
const GLOBAL_WINDOW_SECONDS = 24 * 60 * 60;

function fail(message: string, status: number, code?: string) {
  return NextResponse.json(code ? { error: message, code } : { error: message }, {
    status,
  });
}

/** Trim, collapse the newlines a paste brings in, and bound it. */
function text(value: FormDataEntryValue | null, max: number): string {
  if (typeof value !== 'string') return '';
  // Control characters other than newline and tab never belong in a note or a
  // name, and a name ends up in the owner's email subject.
  const cleaned = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim();
  // By code point, so a surrogate pair is never cut in half.
  return Array.from(cleaned).slice(0, max).join('');
}

export async function POST(request: Request) {
  if (!hasAdminCredentials()) {
    // An operator problem. The reader is told it is not their fault and given
    // no busywork, per the `actor: 'operator'` rule in src/lib/errors.ts.
    return fail(
      'Feedback isn’t switched on for this deployment yet.',
      503,
      codeForArea('client-feedback'),
    );
  }

  const ip = clientIpFromHeaders(request.headers) || 'unknown';
  // Fail closed on both: an unavailable limiter must not turn an anonymous
  // upload endpoint into an unlimited one.
  // Per-address first: a refused address must stop here, not keep spending the
  // global budget and lock everyone else out for a day.
  const withinIp = await checkRateLimit(
    `scope-feedback:ip:${ip}`,
    PER_IP_LIMIT,
    PER_IP_WINDOW_SECONDS,
    { failClosed: true },
  );
  if (!withinIp) {
    return fail('You’ve sent a few already. Try again in an hour.', 429);
  }
  const withinGlobal = await checkRateLimit(
    'scope-feedback:all',
    GLOBAL_LIMIT,
    GLOBAL_WINDOW_SECONDS,
    { failClosed: true },
  );
  if (!withinGlobal) {
    return fail('Too much feedback at once. Try again later.', 429);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail('That didn’t send. Try again.', 400);
  }

  const body = text(formData.get('body'), MAX_BODY_CHARS);
  const reporter = text(formData.get('reporter'), MAX_REPORTER_CHARS);
  const itemId = text(formData.get('itemId'), MAX_ITEM_ID_CHARS);
  const itemLabel = text(formData.get('itemLabel'), MAX_ITEM_LABEL_CHARS);

  // Validation, so no code: the sentence already says what to change.
  if (!body) return fail('Write what you saw before sending.', 400);

  const files = formData
    .getAll('screenshots')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_FILES) {
    return fail(`Attach up to ${MAX_FILES} screenshots.`, 400);
  }
  for (const file of files) {
    if (!isAcceptableImage(file)) {
      return fail('Screenshots need to be images (PNG, JPG, HEIC, GIF or WebP).', 400);
    }
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    return fail('Screenshots need to come to under 4MB altogether. Remove one or attach smaller ones.', 400);
  }

  const admin = createAdminClient();
  const submissionId = crypto.randomUUID();
  const stored: string[] = [];
  let failedUploads = 0;

  for (const [index, file] of files.entries()) {
    const ext = imageExtensionFor(file);
    // Server-controlled, never the client's file.type.
    const contentType = IMAGE_MIME[ext] ?? 'image/jpeg';
    // Server-generated path. Nothing from the request reaches it, so a crafted
    // filename cannot traverse out or land in another submission's folder.
    const path = `${submissionId}/${index}-${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error } = await admin.storage
      .from('client-feedback')
      .upload(path, bytes, { cacheControl: '3600', contentType, upsert: false });

    if (error) {
      // A screenshot that would not upload is not a reason to lose the words.
      failedUploads += 1;
      await reportOperationalError('client-feedback', error, {
        submissionId,
        bytes: file.size,
      });
      continue;
    }
    stored.push(path);
  }

  const { error: insertError } = await admin.from('client_feedback').insert({
    item_id: itemId || null,
    item_label: itemLabel || null,
    body,
    reporter: reporter || null,
    screenshots: stored,
  });

  if (insertError) {
    if (stored.length > 0) {
      await admin.storage.from('client-feedback').remove(stored);
    }
    await reportOperationalError('client-feedback', insertError, {
      submissionId,
      screenshots: stored.length,
    });
    return fail(
      'That feedback didn’t send.',
      500,
      codeForArea('client-feedback'),
    );
  }

  // Tell the owner straight away. A note is rare and substantive, so it goes
  // out in full rather than being batched — and it never fails the write that
  // carried it, because her words matter more than our telling of them.
  try {
    await notifyNewFeedback({
      body,
      reporter: reporter || null,
      itemId: itemId || null,
      itemLabel: itemLabel || null,
      screenshots: stored.length,
    });
  } catch (error) {
    await reportOperationalError('scope-watch', error, { submissionId });
  }

  return NextResponse.json({
    ok: true,
    screenshots: stored.length,
    // Said plainly rather than silently, so nobody believes a picture arrived
    // that did not.
    ...(failedUploads > 0 ? { failedUploads } : {}),
  });
}
