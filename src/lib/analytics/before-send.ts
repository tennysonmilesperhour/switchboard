import type { CaptureResult } from 'posthog-js';

/**
 * Shared `before_send` hook for the browser PostHog client (wired in
 * `src/components/system/PostHogProvider.tsx`). Two jobs, in order:
 *
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
