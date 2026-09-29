/**
 * Shared output-encoding and input-validation helpers for untrusted data that
 * crosses a trust boundary (HTML `<script>` blocks, CSV exports, redirect
 * targets). These are deliberately small, pure, and unit-tested so the escaping
 * rules live in exactly one place — see docs/SECURITY.md for the precedents
 * these enforce.
 */

// U+2028 / U+2029: valid in JSON strings but illegal unescaped in a JS string
// literal. Built from char codes so the source stays pure ASCII.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * Serialize a value for embedding inside an inline `<script>` tag (e.g.
 * JSON-LD). `JSON.stringify` alone is NOT safe here: it does not escape `<`,
 * so a user-controlled string containing `</script>` closes the tag early and
 * anything after it is parsed as HTML — a stored-XSS vector. We escape the
 * characters that can break out of, or confuse a parser inside, a script
 * element:
 *   - `<` and `>`   -> prevent `</script>` (and `<!--`) breakout
 *   - `&`           -> keep entities from being introduced
 *   - U+2028/U+2029 -> valid JSON but illegal in JS string literals (defensive)
 * The result is still valid JSON (these become `\uXXXX` escapes).
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029');
}

/**
 * Validate a post-auth redirect target. We only ever redirect to our OWN
 * relative paths; accepting an absolute or protocol-relative URL from a query
 * param is an open redirect (e.g. `next=@evil.com` -> `https://app@evil.com`,
 * `next=//evil.com`, or `next=https://evil.com`). Returns a safe same-site path
 * or the fallback.
 *
 * A valid value must start with a single `/`, must not start with `//` or
 * `/\` (both resolve to another origin in browsers), and must not contain a
 * backslash or control character.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = '/',
): string {
  if (!next) return fallback;
  if (next[0] !== '/') return fallback; // must be relative to our origin
  if (next[1] === '/' || next[1] === '\\') return fallback; // //host or /\host
  for (let i = 0; i < next.length; i += 1) {
    const code = next.charCodeAt(i);
    // Reject control characters (incl. CR/LF/TAB) and backslash anywhere.
    if (code < 0x20 || code === 0x7f || code === 0x5c) return fallback;
  }
  return next;
}

/**
 * Validate a host-supplied outbound URL before it becomes an `href` or `src`.
 *
 * Cover images and wishlist links are typed by a host and rendered to guests on
 * public pages, so the stored value is untrusted at the sink: `javascript:` and
 * `data:` in an `href` execute on click. Only absolute http(s) URLs survive; a
 * scheme-less value is read as `https://`, matching how a host actually types
 * "example.com". Anything else returns null, so the caller renders nothing.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  // Only prepend a scheme when there is none at all — never "fix" a rejected
  // scheme like `javascript:alert(1)` into `https://javascript:alert(1)`.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Encode one field for a CSV export. Two distinct concerns:
 *   1. RFC 4180 quoting so commas/quotes/newlines don't corrupt columns.
 *   2. Spreadsheet formula injection: a cell beginning with `= + - @` (or a
 *      tab / CR, which Excel strips before evaluating) is executed as a formula
 *      when the host opens the file - e.g. `=HYPERLINK(...)` or `=cmd|...`. The
 *      exported data (guest names/contacts) is attacker-supplied, so we prefix
 *      such cells with a single quote to neutralize evaluation.
 */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) {
    v = `'${v}`;
  }
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Match untrusted text literally inside a SQL `LIKE`/`ILIKE` pattern.
 *
 * `%` and `_` are wildcards there, so a host who typed `%` as a plan's place
 * matched every verified venue and was shown some unrelated business's perk.
 * Backslash is PostgreSQL's default escape character, so it is escaped first.
 */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
