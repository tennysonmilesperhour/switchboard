/**
 * The shared vocabulary for "who's coming" on Explore.
 *
 * It lives apart from `discovery.ts` because the search form is a client
 * component and that module pulls in the Anthropic SDK. The form renders these
 * options, the server normalises whatever comes back, and `describeCompany`
 * turns the pair into the one line the curator reads — so a chip label and the
 * prompt can never drift.
 */

export const GROUP_SIZES = [
  'Just me',
  'Just us two',
  'Small group (3-6)',
  'Bigger crew (7+)',
] as const;

export type GroupSize = (typeof GROUP_SIZES)[number];

export const DEFAULT_GROUP_SIZE: GroupSize = 'Just us two';

export function isGroupSize(value: string): value is GroupSize {
  return (GROUP_SIZES as readonly string[]).includes(value);
}

/** The form is the only sanctioned source of these; anything else is a default. */
export function normalizeGroupSize(value: string): GroupSize {
  return isGroupSize(value) ? value : DEFAULT_GROUP_SIZE;
}

export function isSolo(groupSize: string): boolean {
  return normalizeGroupSize(groupSize) === 'Just me';
}

/**
 * "Just me" and "open to meeting people" are independent: going out alone is
 * not a request to be introduced to strangers, and a crew can still want a room
 * where they mix. Both readings get their own guidance.
 */
export function describeCompany(groupSize: string, openToMeeting: boolean): string {
  const size = normalizeGroupSize(groupSize);
  const solo = size === 'Just me';

  const who = solo ? 'Going solo - one person, by choice.' : `Group size: ${size}.`;

  const guidance = solo
    ? openToMeeting
      ? 'They are open to meeting people while they are out. Favour things that are ' +
        'easy to walk into alone and where talking to a stranger is normal and ' +
        'low-stakes: drop-in classes, counter and communal seating, group runs, ' +
        'trivia, volunteer shifts, community nights. Never suggest something that ' +
        'only works if someone comes with them.'
      : 'They want their own company. Favour things that are genuinely good alone - ' +
        'nothing that needs a second person, seats badly for one, or prices per ' +
        'pair - and do not nudge them to socialise.'
    : openToMeeting
      ? 'They are also open to meeting other people while they are out, so favour ' +
        'settings where a group naturally mixes with strangers - communal tables, ' +
        'leagues, festivals, classes - over a private booth.'
      : '';

  return guidance ? `${who} ${guidance}` : who;
}
