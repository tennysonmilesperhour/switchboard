/**
 * Which context an "Interested" tap in people discovery saves.
 *
 * A discovery match forms only when both people saved the same context
 * (`check_mutual_match` compares `activity` exactly). Each card used to default
 * to the other person's first listed context, so when Ana and Bo both tapped
 * Interested on each other, Ana saved Bo's first context and Bo saved Ana's:
 * two people who chose each other, never matched, and neither was told.
 *
 * The default is now a context both people offer, and the same one from both
 * sides: the tiers below are intersections (symmetric), and each is sorted by
 * code unit, which does not depend on either reader's locale or list order.
 */

export interface ContextSource {
  /** What this person is open to (their discovery contexts, else down-to). */
  contexts: string[];
  shared_down_to: string[];
  shared_interests: string[];
}

const MAX_OPTIONS = 8;

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * The reader's own contexts, as `list_discoverable_people` computes another
 * person's: their chosen discovery contexts, or their down-to list when none.
 */
export function ownContexts(discoveryContexts: string[] | null | undefined, downTo: string[] | null | undefined): string[] {
  return discoveryContexts && discoveryContexts.length > 0 ? discoveryContexts : downTo ?? [];
}

export function discoveryContextChoice(
  person: ContextSource,
  mine: string[],
): { options: string[]; defaultContext: string } {
  const mineSet = new Set(mine);
  const tiers = [
    sorted(person.contexts.filter((context) => mineSet.has(context))),
    sorted(person.shared_down_to),
    sorted(person.shared_interests),
  ];
  const defaultContext =
    tiers.find((tier) => tier.length > 0)?.[0] ?? person.contexts[0] ?? 'Connect';
  const options = [
    ...new Set([
      defaultContext,
      ...person.contexts,
      ...person.shared_down_to,
      ...person.shared_interests,
    ]),
  ].slice(0, MAX_OPTIONS);
  return { options, defaultContext };
}
