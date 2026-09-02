import { headers } from 'next/headers';

/** Keep one address and an inert character set before it becomes limiter input. */
export function forwardedClientIp(value: string | null): string {
  const candidate = value?.split(',')[0]?.trim() ?? '';
  return /^[0-9a-f:.]{3,64}$/i.test(candidate) ? candidate.toLowerCase() : 'unknown';
}

export function clientIpFromHeaders(
  requestHeaders: Pick<Headers, 'get'>,
): string {
  // Vercel's ingress supplies x-vercel-forwarded-for independently of a
  // proxy-overwritten x-forwarded-for. The fallbacks keep local and alternate
  // deployments usable; a missing value deliberately shares the closed
  // `unknown` bucket instead of disabling the guard.
  return forwardedClientIp(
    requestHeaders.get('x-vercel-forwarded-for') ??
      requestHeaders.get('x-forwarded-for') ??
      requestHeaders.get('x-real-ip'),
  );
}

export async function requestClientIp(): Promise<string> {
  const requestHeaders = await headers();
  return clientIpFromHeaders(requestHeaders);
}
