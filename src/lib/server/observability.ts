import { codeForArea, failure, type ErrorCode, type Failure } from '@/lib/errors';

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
