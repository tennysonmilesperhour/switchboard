/**
 * Outbound map links. A plan's "where" is free text (a place name, an address,
 * or both), so the only thing we can build reliably is a *search* URL — never a
 * coordinate deep link we'd have to guess at.
 */

/**
 * Google Maps search for a plan's location. Prefers name + address together,
 * which is what disambiguates "my place" style names from a real venue. Returns
 * null when there is nothing to search for, so callers render plain text.
 */
export function mapsSearchUrl(
  locationName: string | null | undefined,
  locationAddress: string | null | undefined,
): string | null {
  const query = [locationName?.trim(), locationAddress?.trim()]
    .filter((part): part is string => Boolean(part))
    // A name that is already the start of the address ("Miller Park" +
    // "Miller Park, Milwaukee") would search for it twice.
    .filter((part, index, parts) => parts.findIndex((p) => p === part) === index)
    .join(', ');
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
