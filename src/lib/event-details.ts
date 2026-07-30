/**
 * A public invitation needs enough context to answer. A location by itself is
 * useful ("Coffee at Café Luna"), as is a description for a plan whose place
 * is still being decided. Title + time alone is not.
 */
export function hasInviteDetails(
  locationName: string | null | undefined,
  description: string | null | undefined,
): boolean {
  return Boolean(locationName?.trim() || description?.trim());
}
