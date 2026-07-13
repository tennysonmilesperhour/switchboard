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
): Promise<void> {
  const { message, code, details } = describeError(error);
  console.error(JSON.stringify({
    level: 'error',
    area,
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
      text: `[Switchboard] ${area}: ${message}${code ? ` (${code})` : ''}`,
      context,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}
