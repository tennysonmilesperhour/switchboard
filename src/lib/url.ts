/**
 * Sanitize a user- or model-supplied URL down to a safe http(s) absolute URL.
 * Returns null for anything that is not a well-formed http/https URL, so a
 * crafted `javascript:`/`data:` value can never be persisted and rendered as
 * an href. Shared by the profile-link path and the Living Room AI extractor.
 */
export function sanitizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}
