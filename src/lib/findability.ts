/**
 * Whether the people who already have your email or phone can find you.
 *
 * Contact matching (`resolve_profile_contact`) only ever matches a **verified**
 * email or phone — an unverified one is presentation data, not identity. That
 * is the right rule: an unverified detail would let anyone claim to be reachable
 * at someone else's address. But it has a consequence nobody is told about.
 * Verification is opt-in and buried in Settings, so almost nobody does it, and
 * the visible effect lands on the *other* person: they search for their friend
 * by the email they have for them, get nothing back, and reasonably conclude
 * their friend isn't on Switchboard. Importing a whole address book fails the
 * same way, quietly, at scale.
 *
 * So the app has to ask. This module decides what to ask for, and — just as
 * importantly — when to stay quiet: a deployment with no email or SMS provider
 * configured cannot complete a verification at all, and pointing someone at a
 * door that won't open is worse than saying nothing.
 */

export type FindabilityState =
  /** A verified detail is on file. People who have it can find you. */
  | { kind: 'findable' }
  /** A detail is on file, unverified, and this deployment can verify it. */
  | { kind: 'verify'; contact: 'email' | 'phone' }
  /** Nothing usable on file. They need to add a detail before verifying it. */
  | { kind: 'add' }
  /** Neither email nor SMS is configured here — there is nothing to ask for. */
  | { kind: 'unavailable' };

export interface FindabilityInput {
  contacts: ReadonlyArray<{ kind: 'email' | 'phone'; verified: boolean }>;
  /** Which verification channels this deployment can actually deliver. */
  canDeliver: { email: boolean; phone: boolean };
}

export function findabilityState({
  contacts,
  canDeliver,
}: FindabilityInput): FindabilityState {
  if (contacts.some((contact) => contact.verified)) return { kind: 'findable' };
  if (!canDeliver.email && !canDeliver.phone) return { kind: 'unavailable' };

  // Email first when both are on file: the link costs nothing to send and
  // arrives without a carrier in the middle.
  for (const kind of ['email', 'phone'] as const) {
    if (!canDeliver[kind]) continue;
    if (contacts.some((contact) => contact.kind === kind && !contact.verified)) {
      return { kind: 'verify', contact: kind };
    }
  }

  return { kind: 'add' };
}

/**
 * Does the getting-started checklist consider this step done? "Findable" counts,
 * and so does "this deployment can't verify anything" — otherwise the card would
 * carry a step that can never be ticked and would never retire.
 */
export function findabilitySettled(state: FindabilityState): boolean {
  return state.kind === 'findable' || state.kind === 'unavailable';
}
