import type { CaptureResult } from 'posthog-js';

/**
 * Shared `before_send` hook for the browser PostHog client (wired in
 * `src/components/system/PostHogProvider.tsx`). Three jobs, in order:
 *
 *  0. Keep secret-link pages out of analytics. `/proposal/<token>` carries its
 *     credential in the path, and autocapture would copy it into PostHog as
 *     `$current_url` on every visit. Events from that page are dropped, and the
 *     token is scrubbed from any other event that mentions the path (the next
 *     pageview's `$prev_pageview_pathname`, a referrer).
 *  1. Drop Next.js control-flow signals. `redirect()` throws `NEXT_REDIRECT`
 *     and `notFound()` throws `NEXT_NOT_FOUND`; the framework catches both
 *     internally, so neither is a bug. `capture_exceptions` still sees them
 *     bubble and would otherwise file them as error-tracking issues (a real
 *     `NEXT_REDIRECT` issue showed up this way), so they are discarded here.
 *  2. Tag every surviving event with `app: 'switchboard'` so this product's
 *     data stays separable from the other product sharing the PostHog project.
 *
 * Pure and side-effect-free so it can be unit-tested without booting the SDK.
 */
export function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;

  if (isSecretLinkPage(event)) return null;
  event.properties = scrubSecretLinks(event.properties);

  if (event.event === '$exception' && isNextControlFlow(event)) {
    return null;
  }

  event.properties = { ...event.properties, app: 'switchboard' };
  return event;
}

/**
 * Next.js signals carry their marker in the exception's type or value (e.g.
 * `NEXT_REDIRECT`), which PostHog records in `$exception_list`.
 */
function isNextControlFlow(event: CaptureResult): boolean {
  const list = event.properties?.['$exception_list'];
  if (!Array.isArray(list)) return false;
  return list.some((exception) => {
    const marker = `${exception?.type ?? ''} ${exception?.value ?? ''}`;
    return marker.includes('NEXT_REDIRECT') || marker.includes('NEXT_NOT_FOUND');
  });
}

/** Paths whose final segment is a bearer credential. Extend this list, never the page. */
const SECRET_LINK_PATH = /\/proposal\/[^/?#\s]+/g;

function currentPath(event: CaptureResult): string {
  const props = event.properties ?? {};
  const pathname = props['$pathname'];
  if (typeof pathname === 'string') return pathname;
  const url = props['$current_url'];
  if (typeof url !== 'string') return '';
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

function isSecretLinkPage(event: CaptureResult): boolean {
  return currentPath(event).startsWith('/proposal/');
}

/** Redacts the credential segment from every top-level string property. */
function scrubSecretLinks(properties: CaptureResult['properties']): CaptureResult['properties'] {
  const scrubbed = { ...properties };
  for (const [key, value] of Object.entries(scrubbed)) {
    if (typeof value === 'string' && value.includes('/proposal/')) {
      scrubbed[key] = value.replace(SECRET_LINK_PATH, '/proposal/[redacted]');
    }
  }
  return scrubbed;
}
