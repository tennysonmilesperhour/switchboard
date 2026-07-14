import 'server-only';

/**
 * Dependency-free server-side product analytics via PostHog's HTTP capture
 * API, in the same "bonus, never a blocker" spirit as the AI and email layers:
 * a no-op until POSTHOG_KEY is set, and it never throws into the caller.
 *
 * Server-side capture keeps the API key off the client and means the core
 * funnel (plan created -> happened, invite responded, vote cast) is measured
 * without a browser SDK. Never pass message/vote/intent CONTENT as a property.
 */
const KEY = process.env.POSTHOG_KEY;
const HOST = (process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/$/, '');

export function analyticsEnabled(): boolean {
  return !!KEY;
}

export async function capture(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!KEY) return;
  try {
    await fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'switchboard-server' },
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    });
  } catch {
    // Analytics is a bonus, never a blocker.
  }
}
