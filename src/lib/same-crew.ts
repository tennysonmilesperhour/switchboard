/**
 * "Same crew again": the pure half.
 *
 * When you and two or more people from one plan all said yes to hanging out
 * again (each a hang_again match with you), Home offers a plan with all of
 * them already invited. Timeleft added the same thing ("Repeat") because the
 * table people want back is the one they had (docs/research/timeleft-onboarding.md,
 * idea 2).
 */

/** How many other people make a crew. Two people is just a match. */
export const MIN_CREW = 2;

/** How long after the newest match a crew stays on Home. */
export const CREW_DAYS = 14;

export interface CrewMatch {
  otherId: string;
  eventId: string | null;
  createdAt: string;
}

export interface Crew {
  eventId: string;
  memberIds: string[];
  latestAt: string;
}

/**
 * Group hang-again matches by the plan they came from. A crew is fresh while
 * its newest match is under `CREW_DAYS` old, and gone once you have already
 * invited any of them to a plan made after that match.
 */
export function groupCrews(
  matches: readonly CrewMatch[],
  plannedSince: ReadonlyArray<{ inviteeIds: readonly string[]; createdAt: string }>,
  now: Date = new Date(),
): Crew[] {
  const cutoff = now.getTime() - CREW_DAYS * 86_400_000;
  const byEvent = new Map<string, { members: Set<string>; latest: string }>();
  for (const match of matches) {
    if (!match.eventId) continue;
    const entry = byEvent.get(match.eventId) ?? { members: new Set<string>(), latest: match.createdAt };
    entry.members.add(match.otherId);
    if (match.createdAt > entry.latest) entry.latest = match.createdAt;
    byEvent.set(match.eventId, entry);
  }

  const crews: Crew[] = [];
  for (const [eventId, { members, latest }] of byEvent) {
    if (members.size < MIN_CREW) continue;
    if (new Date(latest).getTime() < cutoff) continue;
    const alreadyPlanned = plannedSince.some(
      (plan) => plan.createdAt > latest && plan.inviteeIds.some((id) => members.has(id)),
    );
    if (alreadyPlanned) continue;
    crews.push({ eventId, memberIds: [...members].sort(), latestAt: latest });
  }
  return crews.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

/** The new-plan link with the whole crew already on the list. */
export function crewPlanHref(memberIds: readonly string[], title: string): string {
  const params = new URLSearchParams();
  for (const id of memberIds) params.append('invite', id);
  if (title) params.set('title', title);
  return `/events/new?${params.toString()}`;
}
