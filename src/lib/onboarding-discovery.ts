/**
 * What onboarding seeds into discovery: the pure half.
 *
 * Onboarding asks two things the discovery lanes otherwise never learn until
 * someone finds /discover/preferences:
 *
 *   1. What are you here for? Plans with people you know is always on; meeting
 *      new friends, dating, and networking are each a lane the person can turn
 *      on. Picking any of them makes the profile discoverable, so the card that
 *      offers it says so in the same place.
 *   2. Which of your interests matter most? Up to three, stored as high weights
 *      so the strongest shared item the matching rule compares is one the
 *      person actually cares about.
 *
 * Research behind both: docs/research/timeleft-onboarding.md (R1, R2).
 */

import {
  DEFAULT_BAR,
  GENDERS,
  SELVES,
  isGender,
  itemKey,
  parseItemKey,
  type Gender,
  type Self,
} from '@/lib/discovery-lanes';

/** The onboarding card for each lane. Plans with known people has no lane. */
export const LANE_CARDS: Record<Self, { label: string; blurb: string }> = {
  friends: {
    label: 'Meet new friends',
    blurb: 'People nearby who are into the same things.',
  },
  dating: {
    label: 'Dating',
    blurb: 'People you might want to date.',
  },
  networking: {
    label: 'Networking',
    blurb: 'People worth knowing for work or a field.',
  },
};

export const MAX_TOP_PICKS = 3;

/** "Love it": the highest weight tier the matching rule compares. */
export const TOP_PICK_WEIGHT = 85;

export interface OnboardingDiscoveryInput {
  lanes: readonly string[];
  top: readonly string[];
  interests: readonly string[];
  downTo: readonly string[];
  identifiesAs: string | null;
  interestedIn: readonly string[];
}

export interface OnboardingDiscovery {
  lanes: Self[];
  /** Item keys (`interest:Hiking`, `down_to:Coffee`), at most three. */
  top: string[];
  identifiesAs: Gender | null;
  interestedIn: Gender[];
}

/**
 * Keep only what the form could have sent: known lanes, and top picks that are
 * among the interests and activities submitted with them. Dating identity is
 * kept only when the dating lane is on.
 */
export function parseOnboardingDiscovery(input: OnboardingDiscoveryInput): OnboardingDiscovery {
  const lanes = SELVES.filter((self) => input.lanes.includes(self));

  const offered = new Set([
    ...input.interests.map((label) => itemKey('interest', label)),
    ...input.downTo.map((label) => itemKey('down_to', label)),
  ]);
  const top: string[] = [];
  for (const key of input.top) {
    if (top.length >= MAX_TOP_PICKS) break;
    if (top.includes(key) || !offered.has(key) || key.length > 100 || !parseItemKey(key)) continue;
    top.push(key);
  }

  const dating = lanes.includes('dating');
  return {
    lanes,
    top,
    identifiesAs: dating && isGender(input.identifiesAs) ? input.identifiesAs : null,
    interestedIn: dating
      ? GENDERS.filter((gender) => input.interestedIn.includes(gender))
      : [],
  };
}

export interface SelfRow {
  user_id: string;
  self: Self;
  enabled: boolean;
  bar: number;
  identifies_as: Gender | null;
  interested_in: Gender[];
}

/**
 * One row per lane once any lane is picked. A missing friends row means "on
 * whenever discoverable", so someone who picked only dating would otherwise
 * land in the friends lane too: every lane gets an explicit row. The friends
 * bar starts at 0, the same as that missing-row default.
 */
export function onboardingSelfRows(userId: string, picked: OnboardingDiscovery): SelfRow[] {
  if (picked.lanes.length === 0) return [];
  return SELVES.map((self) => ({
    user_id: userId,
    self,
    enabled: picked.lanes.includes(self),
    bar: self === 'friends' ? 0 : DEFAULT_BAR,
    identifies_as: self === 'dating' ? picked.identifiesAs : null,
    interested_in: self === 'dating' ? picked.interestedIn : [],
  }));
}

/**
 * Top picks are weighted in the friends lane and in every lane the person
 * turned on, so they still count if friends is switched on later.
 */
export function onboardingWeightRows(
  userId: string,
  picked: OnboardingDiscovery,
): Array<{ user_id: string; self: Self; item: string; weight: number }> {
  const lanes = SELVES.filter((self) => self === 'friends' || picked.lanes.includes(self));
  return lanes.flatMap((self) =>
    picked.top.map((item) => ({ user_id: userId, self, item, weight: TOP_PICK_WEIGHT })),
  );
}
