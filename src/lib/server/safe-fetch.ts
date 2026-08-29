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

// Enough for the shortener and consent-page chains real links sit behind, while
// still bounded. Three was too tight: following redirects by hand replaced a
// platform default of about twenty, and links that used to import stopped.
const MAX_REDIRECTS = 8;
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
  // URL.hostname keeps the brackets on an IPv6 literal, and dns.lookup does not
  // accept them — every IPv6 URL would fail the lookup and be refused as
  // private. A literal needs no lookup anyway: isFetchableUrl already judged
  // the address itself.
  const host = hostname.replace(/^\[|\]$/g, '');
  if (/^[0-9.]+$/.test(host) || host.includes(':')) return !isPrivateAddress(host);
  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

/**
 * Read at most `maxBytes`, then stop pulling.
 *
 * `arrayBuffer()` buffers the entire response before any cap can be applied, so
 * the limit only ever trimmed what had already been held in memory: a hostile
 * or merely enormous URL could make the server allocate without bound. This
 * stops reading at the cap and cancels the rest of the stream.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const size = Math.min(total, maxBytes);
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, size - offset);
    if (take <= 0) break;
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder().decode(merged);
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
      // A malformed Location would throw out of here and escape the caller's
      // ActionResult contract as an unhandled server error, turning a handled
      // "we couldn't read that link" into a crashed page transition.
      try {
        target = new URL(location, checked.url).toString();
      } catch {
        return { ok: false, reason: 'http-error', status: response.status };
      }
      continue;
    }

    if (!response.ok) return { ok: false, reason: 'http-error', status: response.status };

    let body: string;
    try {
      body = await readCapped(response, maxBytes);
    } catch {
      // A connection that dies mid-body is the same failure to the caller as
      // one that never opened.
      return { ok: false, reason: 'unreachable' };
    }
    return {
      ok: true,
      body,
      contentType: response.headers.get('content-type') ?? '',
      status: response.status,
    };
  }

  return { ok: false, reason: 'redirect-loop' };
}
