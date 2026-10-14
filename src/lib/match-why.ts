/**
 * "Why you two" for a match room: the pure half.
 *
 * `match_room_why` returns what the app already knows about how a pair
 * matched (20261014122000_match_room_why.sql). This turns it into the few
 * sentences the room shows above the conversation, so nobody has to guess what
 * they matched on (docs/research/timeleft-onboarding.md, idea 1).
 */

import { laneOfActivity, stripLane, SELF_INFO } from '@/lib/discovery-lanes';

export interface MatchWhy {
  kind: string;
  activity: string;
  shared: string[];
  eventTitle: string | null;
  introducedBy: string | null;
}

/** "a", "a and b", "a, b, and c". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** One to three short sentences, most specific first. Empty when unknown. */
export function matchReasons(why: MatchWhy | null): string[] {
  if (!why) return [];
  const reasons: string[] = [];
  const activity = why.activity.trim();

  if (why.introducedBy) {
    reasons.push(
      activity
        ? `${why.introducedBy} introduced you over ${activity.toLowerCase()}.`
        : `${why.introducedBy} introduced you.`,
    );
  } else if (why.kind === 'hang_again') {
    reasons.push(
      why.eventTitle
        ? `You were both at ${why.eventTitle} and both wanted to hang out again.`
        : 'You both wanted to hang out again after a plan together.',
    );
  } else if (why.kind === 'discover_connect') {
    const lane = laneOfActivity(activity);
    const label = stripLane(activity);
    const where = lane === 'friends' ? 'Discover' : `Discover (${SELF_INFO[lane].label.toLowerCase()})`;
    reasons.push(
      label
        ? `You both tapped each other in ${where} over ${label.toLowerCase()}.`
        : `You both tapped each other in ${where}.`,
    );
  } else if (why.kind === 'down_to_connect' && activity) {
    reasons.push(`You both said you’re down to ${activity.toLowerCase()}.`);
  }

  if (why.shared.length > 0) {
    reasons.push(`You both picked ${listOf(why.shared)}.`);
  }
  return reasons;
}
