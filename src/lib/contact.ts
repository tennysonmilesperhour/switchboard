/**
 * The address users reach a human at — copyright/DMCA reports, support, abuse.
 * Configurable per deployment via NEXT_PUBLIC_SUPPORT_EMAIL (safe to expose;
 * it's a published contact), with a sensible default matching the VAPID
 * contact so legal pages always render a real channel instead of "contact the
 * operator" with no way to do so.
 */
export function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'morphiclabsdata@gmail.com';
}
