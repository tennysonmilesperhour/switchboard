import { codeForArea, failure, type ErrorCode, type Failure } from '@/lib/errors';

export const OBSERVABILITY_WEBHOOK_DEDUPE_MS = 60_000;

// Best-effort, per-instance storm control. Serverless instances do not share
// memory, but this still collapses the common case: one broken dependency
// causing the same failure many times inside a warm instance.
const webhookSentAt = new Map<string, number>();

function claimWebhookWindow(area: string, code: ErrorCode, now: number): boolean {
  const key = `${area}:${code}`;
  const previous = webhookSentAt.get(key);
  if (previous !== undefined && now - previous < OBSERVABILITY_WEBHOOK_DEDUPE_MS) {
    return false;
  }

  webhookSentAt.set(key, now);
  // Bound the map even when callers invent high-cardinality areas. Areas should
  // be stable literals, but observability must not become its own memory leak.
  if (webhookSentAt.size > 1_000) {
    const staleBefore = now - OBSERVABILITY_WEBHOOK_DEDUPE_MS;
    for (const [candidate, sentAt] of webhookSentAt) {
      if (sentAt < staleBefore) webhookSentAt.delete(candidate);
    }
  }
  return true;
}

/**
 * Safely extract a human-readable message plus structured fields from any thrown
 * value. Plain `String(error)` turns a Supabase/PostgREST error object into the
 * useless `[object Object]`; this preserves `message`/`code`/`details`/`hint`
 * (which are diagnostic, not secret) while never crashing on an exotic value.
 */
export function describeError(error: unknown): {
  message: string;
  code?: string;
  details?: string;
} {
  if (error instanceof Error) return { message: error.message };
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const message = typeof e.message === 'string' ? e.message : undefined;
    const code = typeof e.code === 'string' ? e.code : undefined;
    const details = typeof e.details === 'string' ? e.details : undefined;
    const hint = typeof e.hint === 'string' ? e.hint : undefined;
    if (message || code || details || hint) {
      return {
        message: message ?? code ?? 'Unknown error',
        code,
        details: details ?? hint,
      };
    }
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: Object.prototype.toString.call(error) };
    }
  }
  return { message: String(error) };
}

export async function reportOperationalError(
  area: string,
  error: unknown,
  context: Record<string, unknown> = {},
  /**
   * The code the user is being shown for this same failure. Logging it is what
   * makes a screenshot joinable to a log line: someone reports "SB-PLAN-SAVE"
   * and the search is exact, instead of a guess from a timestamp.
   */
  userCode?: ErrorCode,
): Promise<void> {
  const { message, code, details } = describeError(error);
  // Derived from the area when the caller doesn't say, so every existing call
  // site gained a code without being touched — and a new area with no mapping
  // fails errors.test.ts rather than silently logging an uncoded failure.
  const shown = userCode ?? codeForArea(area);
  console.error(JSON.stringify({
    level: 'error',
    area,
    userCode: shown,
    message,
    code,
    details,
    context,
    at: new Date().toISOString(),
  }));

  const webhook = process.env.OBSERVABILITY_WEBHOOK_URL;
  if (!webhook) return;
  if (!claimWebhookWindow(area, shown, Date.now())) return;
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `[Switchboard] ${shown} ${area}: ${message}${code ? ` (${code})` : ''}`,
      context,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}

/**
 * Log an operational failure and produce the user-facing result for it, in one
 * call.
 *
 * Prefer this over calling `reportOperationalError` and building the failure
 * separately: the two can't drift, so the code the reader sees is guaranteed to
 * be the code in the log. That guarantee is the whole point — a code that only
 * appears on one side of the wall diagnoses nothing.
 */
export async function reportAndFail(
  code: ErrorCode,
  area: string,
  error: unknown,
  context: Record<string, unknown> = {},
  message?: string,
): Promise<Failure> {
  await reportOperationalError(area, error, context, code);
  return failure(code, message);
}
