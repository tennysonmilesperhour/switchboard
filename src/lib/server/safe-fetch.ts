import { lookup } from 'node:dns/promises';

import { isFetchableUrl, isPrivateAddress } from '@/lib/net-guard';

/**
 * Fetch a URL a user supplied, without letting it reach our own network.
 *
 * Three things have to hold, and each of them fails open if left out:
 *
 *   1. The URL itself must not name a private address. `isFetchableUrl`.
 *   2. The hostname must not *resolve* to one. A name the attacker controls can
 *      point anywhere, so the literal check above is only the first gate — we
 *      resolve it ourselves and inspect every address it returns.
 *   3. Redirects must be re-checked. A public URL that 302s to
 *      `http://169.254.169.254/` defeats checks 1 and 2 entirely, so redirects
 *      are followed by hand with the full check repeated at every hop.
 *
 * Known limit, stated rather than papered over: between our lookup and the
 * request, a hostile DNS server can answer differently and point the actual
 * connection at a private address (DNS rebinding). Closing that needs the
 * connection pinned to the address we validated, which means a custom agent and
 * giving up TLS hostname verification, or a proxy that enforces egress rules.
 * The right long-term answer is egress filtering at the network edge; this
 * raises the bar a long way without it.
 */

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

export type SafeFetchFailure =
  | 'not-a-url'
  | 'scheme'
  | 'no-host'
  | 'private'
  | 'dns'
  | 'redirect-loop'
  | 'unreachable'
  | 'http-error';

export interface SafeFetchResult {
  ok: boolean;
  body?: string;
  contentType?: string;
  status?: number;
  reason?: SafeFetchFailure;
}

/** Resolve a hostname and refuse it if anything it points at is private. */
async function resolvesPublicly(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

export async function safeFetchText(
  rawUrl: string,
  { maxBytes = 1_500_000, accept = '*/*' }: { maxBytes?: number; accept?: string } = {},
): Promise<SafeFetchResult> {
  let target = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checked = isFetchableUrl(target);
    if (!checked.ok) return { ok: false, reason: checked.reason as SafeFetchFailure };
    if (!(await resolvesPublicly(checked.url.hostname))) {
      // 'dns' and 'private' are deliberately not distinguished to the caller:
      // telling someone which internal names resolve is itself a disclosure.
      return { ok: false, reason: 'private' };
    }

    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      response = await fetch(checked.url, {
        // Followed by hand so every hop goes back through the checks above.
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: accept, 'User-Agent': 'SwitchboardBot/1.0 (+https://switchboard.app)' },
      });
    } catch {
      return { ok: false, reason: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, reason: 'http-error', status: response.status };
      target = new URL(location, checked.url).toString();
      continue;
    }

    if (!response.ok) return { ok: false, reason: 'http-error', status: response.status };

    const buffer = await response.arrayBuffer();
    return {
      ok: true,
      body: new TextDecoder().decode(buffer.slice(0, maxBytes)),
      contentType: response.headers.get('content-type') ?? '',
      status: response.status,
    };
  }

  return { ok: false, reason: 'redirect-loop' };
}
