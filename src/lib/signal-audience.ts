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

/** Who one signal is for. Empty everywhere means everyone the person knows. */
export interface SignalAudience {
  circleIds: string[];
  personIds: string[];
  boardIds: string[];
}

export const EMPTY_AUDIENCE: SignalAudience = { circleIds: [], personIds: [], boardIds: [] };

/** Upper bounds on each list; the database enforces the same numbers. */
export const AUDIENCE_LIMITS = { circles: 100, people: 200, groups: 50 } as const;

export function isEveryoneAudience(audience: SignalAudience): boolean {
  return (
    audience.circleIds.length === 0 &&
    audience.personIds.length === 0 &&
    audience.boardIds.length === 0
  );
}

export interface AudienceNames {
  circles: ReadonlyMap<string, string>;
  people: ReadonlyMap<string, string>;
  groups: ReadonlyMap<string, string>;
}

/**
 * One line saying who a signal reaches: "Close Friends, Sam and 2 others, and
 * the Tantra group". Names that no longer resolve (a deleted circle, a
 * connection that ended) are counted rather than shown, so the line never
 * lies about reach it no longer has.
 */
export function describeAudience(audience: SignalAudience, names: AudienceNames): string {
  if (isEveryoneAudience(audience)) return 'Everyone I know';
  const parts: string[] = [];

  const circleNames = audience.circleIds.map((id) => names.circles.get(id)).filter(Boolean) as string[];
  if (circleNames.length > 0) parts.push(circleNames.join(', '));

  const peopleNames = audience.personIds.map((id) => names.people.get(id)).filter(Boolean) as string[];
  if (peopleNames.length === 1) parts.push(peopleNames[0]);
  else if (peopleNames.length === 2) parts.push(`${peopleNames[0]} and ${peopleNames[1]}`);
  else if (peopleNames.length > 2) {
    parts.push(`${peopleNames[0]} and ${peopleNames.length - 1} others`);
  }

  const groupNames = audience.boardIds.map((id) => names.groups.get(id)).filter(Boolean) as string[];
  if (groupNames.length === 1) parts.push(`the ${groupNames[0]} group`);
  else if (groupNames.length > 1) parts.push(`${groupNames.length} groups`);

  if (parts.length === 0) return 'Nobody yet';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * Whether a signal this person turns on could reach anybody at all.
 *
 * NOT "do they have a friend". A signal aimed at a board reaches fellow members
 * whether or not you are connected to them (`signals_visible`), so someone on a
 * neighbourhood board with no accepted connections can use this feature
 * perfectly well — Home used to hide the whole composer from them on
 * `hasConnections` alone.
 *
 * Circles are groupings of connections, so they add no reach of their own: with
 * no connections every circle is empty, and a signal sent to one goes nowhere.
 * They are deliberately not counted here.
 */
export function signalsCanReachAnyone({
  connectionCount,
  boardCount,
}: {
  connectionCount: number;
  boardCount: number;
}): boolean {
  return connectionCount > 0 || boardCount > 0;
}

/**
 * True when an audience names somebody but the composer can name none of them
 * — every circle, person, and group in it has since been deleted, ended, or
 * left. Turning a signal on then has to refuse (the server re-validates every
 * id and would refuse anyway), so the composer must SAY so rather than just
 * greying out its own button: this state is reached by tapping Edit on a live
 * signal, and a Save that refuses in silence is indistinguishable from one
 * that is broken.
 *
 * An empty audience is never this: empty means everyone the person knows.
 */
export function audienceIsUnreachable(
  audience: SignalAudience,
  names: AudienceNames,
): boolean {
  if (isEveryoneAudience(audience)) return false;
  return (
    !audience.circleIds.some((id) => names.circles.has(id)) &&
    !audience.personIds.some((id) => names.people.has(id)) &&
    !audience.boardIds.some((id) => names.groups.has(id))
  );
}
