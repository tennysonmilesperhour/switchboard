/**
 * The feature passport: a private record of which parts of Switchboard you've
 * actually tried.
 *
 * Switchboard hides most of itself on purpose, which keeps it calm and means
 * most of what was built is never met by the people it was built for. The
 * feature index answers "what can this do?"; this answers "what have I
 * actually done?", which is the question that makes someone curious enough to
 * try the next thing.
 *
 * ————————————————————————— the guardrails —————————————————————————
 *
 * `PRODUCT.md` bans manipulative growth loops, and `docs/DOCKET.md` calls out
 * the specific fork this feature sits on: a progress layer either stays
 * private, intrinsic, and celebratory, or it becomes the streak-and-leaderboard
 * machinery the product exists to be an alternative to. This is the first kind,
 * and the rules that keep it there are:
 *
 * - **Private.** Yours only. No sharing, no comparison, nobody else's count.
 * - **Never notifies.** Nothing here is allowed to ping you. It is something
 *   you find, not something that finds you.
 * - **No streaks, no decay, no deadlines.** A stamp is permanent once earned;
 *   there is nothing to keep up and nothing to lose by being away for a month.
 * - **Counts what you did, never what you didn't.** The copy names the next
 *   thing to try, never the number outstanding as a debt.
 * - **Derived, never stored.** Every stamp is computed from what already
 *   happened, so there is no separate progress state to fall out of sync with
 *   reality, and nothing new to keep private.
 *
 * The reward for finishing is a thing to look at, not a rank: an appearance
 * theme (see `src/lib/themes-app.ts`). That is the intrinsic version of the
 * adventure-game idea in the docket, and the deliberate stopping point.
 *
 * ————————————————————————— what isn't a stamp —————————————————————————
 *
 * Every stamp has to correspond to something the database actually recorded.
 * Explore is the instructive omission: describing an evening and reading the
 * suggestions leaves no row anywhere — the AI call is stateless by design — so
 * a "tried Explore" stamp could only be a guess or a new tracking table built
 * for the badge. Neither is worth it. A surface with nothing to derive from
 * simply isn't in the passport.
 */

/** A stamp: one thing you can have tried, tied to a feature-index group. */
export interface PassportStep {
  id: string;
  /** The `FeatureGroup.id` this belongs to, so the two stay in step. */
  group: string;
  /** What you did, in the past tense you'd use about yourself. */
  label: string;
  /** How to do it, for someone who hasn't. */
  hint: string;
  /** Where to go and do it. */
  href: string;
}

export const PASSPORT_STEPS: readonly PassportStep[] = [
  {
    id: 'made-a-plan',
    group: 'plans',
    label: 'Made a plan',
    hint: 'Float anything — coffee counts.',
    href: '/create',
  },
  {
    id: 'answered-an-invite',
    group: 'plans',
    label: 'Answered an invitation',
    hint: 'Say yes or no to something you were asked to.',
    href: '/plans',
  },
  {
    id: 'weighed-in',
    group: 'deciding',
    label: 'Weighed in on a group decision',
    hint: 'Rate the options on any plan that’s still deciding.',
    href: '/plans',
  },
  {
    id: 'added-someone',
    group: 'people',
    label: 'Connected with someone',
    hint: 'Add a friend by handle, or from your contacts.',
    href: '/people',
  },
  {
    id: 'made-a-circle',
    group: 'people',
    label: 'Made a circle',
    hint: 'Group people the way you actually think of them.',
    href: '/people',
  },
  {
    id: 'said-youre-free',
    group: 'you',
    label: 'Told people you were free',
    hint: 'One tap on Home, seen only by the circles you pick.',
    href: '/',
  },
  {
    id: 'checked-in',
    group: 'places',
    label: 'Checked in somewhere',
    hint: 'A moment, or a zone you’re at.',
    href: '/moments',
  },
  {
    id: 'joined-a-group',
    group: 'places',
    label: 'Joined a board or a zone',
    hint: 'A neighborhood board, or a zone for somewhere you’ll be.',
    href: '/zones',
  },
  {
    id: 'said-something',
    group: 'rooms',
    label: 'Said something in a room',
    hint: 'Every plan has one, and it files what you drop in.',
    href: '/rooms',
  },
] as const;

/** Which stamps are earned, keyed by step id. */
export type PassportState = Record<string, boolean>;

export interface PassportProgress {
  earned: number;
  total: number;
  /** Complete, and therefore a thing to celebrate exactly once. */
  done: boolean;
  /** The next untried thing, or null when there isn't one. */
  next: PassportStep | null;
}

export function passportProgress(state: PassportState): PassportProgress {
  const earned = PASSPORT_STEPS.filter((step) => state[step.id]).length;
  return {
    earned,
    total: PASSPORT_STEPS.length,
    done: earned === PASSPORT_STEPS.length,
    next: PASSPORT_STEPS.find((step) => !state[step.id]) ?? null,
  };
}

/** Per-group tallies, so the index can show progress beside each section. */
export function passportByGroup(
  state: PassportState,
): Record<string, { earned: number; total: number }> {
  const byGroup: Record<string, { earned: number; total: number }> = {};
  for (const step of PASSPORT_STEPS) {
    const entry = (byGroup[step.group] ??= { earned: 0, total: 0 });
    entry.total += 1;
    if (state[step.id]) entry.earned += 1;
  }
  return byGroup;
}
