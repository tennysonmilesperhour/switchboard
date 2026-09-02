/** Pick the circle a fresh availability signal should start with. */
export function resolveDefaultSignalCircle(
  circleIds: readonly string[],
  rememberedCircleId: string | null,
): string | null {
  if (rememberedCircleId && circleIds.includes(rememberedCircleId)) {
    return rememberedCircleId;
  }
  return circleIds[0] ?? null;
}

/**
 * An existing signal's audience is authoritative, including an explicit empty
 * (Everyone) audience. Only a fresh composer receives the circle default.
 */
export function resolveSignalAudience(
  activeAudience: readonly string[] | null,
  defaultCircleId: string | null,
): string[] {
  if (activeAudience !== null) return [...activeAudience];
  return defaultCircleId ? [defaultCircleId] : [];
}

/** The newly selected circle is the most recent audience preference. */
export function mostRecentlyChosenCircle(
  previous: readonly string[],
  next: readonly string[],
): string | null {
  return next.find((id) => !previous.includes(id)) ?? next.at(-1) ?? null;
}
