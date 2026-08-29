/**
 * Which addresses a user-supplied URL is allowed to reach.
 *
 * Fetching a link somebody pastes means our server makes a request on their
 * behalf, from inside our network, with our credentials on the wire. Left
 * unguarded that is a server-side request forgery hole: `http://127.0.0.1:port`
 * reaches services never exposed to the internet, and on every major cloud
 * `http://169.254.169.254/` is the instance metadata endpoint that hands out
 * role credentials. A calendar URL is pasted by definition, so this is not a
 * theoretical concern for it.
 *
 * Pure and unit-tested, separate from the fetching, because "is this address
 * safe" is the part worth proving exhaustively and the part that must not drift
 * when the fetch code changes.
 */

/** Parse dotted-quad IPv4 into its four octets, or null. */
function octets(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

/**
 * Addresses that are not the public internet.
 *
 * Deny-listed rather than allow-listed because the set of things that must not
 * be reachable is the knowable one; "every public address" is not enumerable.
 */
export function isPrivateAddress(address: string): boolean {
  const host = address.trim().toLowerCase().replace(/^\[|\]$/g, '');

  const v4 = octets(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local — cloud metadata lives here
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 192 && v4[1] === 0 && v4[2] === 0) return true; // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  if (host === '::' || host === '::1') return true;
  // An IPv4-mapped v6 address (::ffff:127.0.0.1) reaches the same host as the
  // v4 form, so it has to be judged by the address it embeds.
  const mapped = host.match(/^::ffff:(.+)$/);
  if (mapped) {
    const inner = mapped[1];
    if (octets(inner)) return isPrivateAddress(inner);
    // ::ffff:7f00:1 — the same thing written in hex.
    const hex = inner.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const value = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return isPrivateAddress(
        [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.'),
      );
    }
  }
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // link-local fe80::/10

  return false;
}

/**
 * Whether a URL is one we are willing to fetch at all, before DNS.
 *
 * Catches the schemes that never make sense from a server (`file:`, `gopher:`)
 * and the literal-IP forms of the addresses above, so an obvious attempt is
 * refused without a lookup.
 */
export function isFetchableUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  // webcal: is how calendars are commonly published, and it is https
  // underneath. Swapped before parsing, not after: WHATWG URL refuses to
  // reassign `protocol` between a non-special scheme and a special one, so
  // doing it on the parsed object is a silent no-op that leaves every pasted
  // webcal link rejected.
  const trimmed = raw.trim().replace(/^webcal:\/\//i, 'https://');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme' };
  }
  if (!url.hostname) return { ok: false, reason: 'no-host' };
  if (url.hostname.toLowerCase() === 'localhost') return { ok: false, reason: 'private' };
  if (isPrivateAddress(url.hostname)) return { ok: false, reason: 'private' };
  return { ok: true, url };
}
