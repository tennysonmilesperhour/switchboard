export async function reportOperationalError(
  area: string,
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    level: 'error',
    area,
    message,
    context,
    at: new Date().toISOString(),
  }));

  const webhook = process.env.OBSERVABILITY_WEBHOOK_URL;
  if (!webhook) return;
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `[Switchboard] ${area}: ${message}`, context }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}
