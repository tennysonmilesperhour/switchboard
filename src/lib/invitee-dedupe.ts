import { isEmail } from './auth-identity';
import { normalizePhoneNumber } from './phone';

/**
 * Two questions about an invite list, kept apart on purpose.
 *
 * A host ended a round of feedback with "I have somebody on there twice", and
 * the list she was looking at had `Xochitl` (a guest, added by hand) sitting
 * above `Xochitl Sarah Millington` (the same human, pulled in from her phone's
 * contacts a minute later). Nothing in the wizard noticed, because the two
 * entries genuinely were different rows: one has a profile id, the other has a
 * phone number, and no field they both carry was equal.
 *
 * So there are two different answers here, and conflating them is how this
 * feature goes wrong in the other direction:
 *
 * - **The same address is the same invitation.** Two rows pointing at one
 *   profile id, or one email, or one phone number, would send that person two
 *   copies of the same plan. There is nothing to ask about: `sameTarget`
 *   answers it exactly, and the wizard refuses the second add.
 * - **The same *name* is a guess.** Two Sarahs in one friend group is normal,
 *   and quietly dropping the second one would be a far worse bug than showing
 *   the first one twice. `likelyDuplicates` therefore never removes anything —
 *   it flags a pair for the host, who is the only one who knows.
 *
 * Nothing here looks at avatars, mutual friends, or anything else that would
 * make the guess cleverer. A cleverer guess is a guess that is wrong less
 * often and more confidently, which is the wrong trade for a list whose whole
 * job is to be checked by eye before it goes out.
 */

/** The fields of a draft or live invitee this module compares. */
export interface DedupeTarget {
  /** Stable identity for this row — the draft key, or the invite id. */
  key: string;
  /** The account behind this invite, when there is one. */
  profileId: string | null;
  /** What the host typed or what the contact card said. */
  name: string;
  /** Email, phone, or `@handle` for an off-platform guest. */
  contact?: string | null;
}

/**
 * The one string that identifies where an invitation would be delivered, or
 * null when the row names no address at all (a guest added by name only — who
 * gets a share link, and so can never be a duplicate delivery).
 *
 * Phone numbers go through `normalizePhoneNumber` so `(801) 555-0134` and
 * `+18015550134` collapse; emails are lower-cased and trimmed; a `@handle` is
 * stripped of its `@`. Anything else is normalised as a handle rather than
 * dropped, because the guest box accepts usernames too.
 */
export function deliveryKey(target: DedupeTarget): string | null {
  if (target.profileId) return `profile:${target.profileId}`;
  const contact = target.contact?.trim();
  if (!contact) return null;
  const phone = normalizePhoneNumber(contact);
  if (phone) return `phone:${phone}`;
  if (isEmail(contact)) return `email:${contact.toLowerCase()}`;
  return `handle:${contact.replace(/^@/, '').toLowerCase()}`;
}

/** Would inviting both of these send one person two copies of the plan? */
export function sameTarget(a: DedupeTarget, b: DedupeTarget): boolean {
  const left = deliveryKey(a);
  return left !== null && left === deliveryKey(b);
}

/**
 * The row already on the list that `candidate` would duplicate, or null.
 *
 * Callers use this to refuse the add rather than to merge: a host who taps a
 * contact that is already selected means "take them off", and the toggles
 * handle that themselves. This is for the paths where the same person arrives
 * by two different doors.
 */
export function existingTarget<T extends DedupeTarget>(
  list: readonly T[],
  candidate: DedupeTarget,
): T | null {
  return list.find((entry) => entry.key !== candidate.key && sameTarget(entry, candidate)) ?? null;
}

/** Words of a name, lowercased, with punctuation and accents dropped. */
function nameWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Apostrophes vanish rather than splitting a word, so `O’Neill` and
    // `ONeill` are one name; every other mark becomes a gap, so `Mary-Jane`
    // and `Mary Jane` are too.
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Do these two names plausibly belong to one person?
 *
 * True when the names are the same, or when one's words are the leading words
 * of the other's — `Xochitl` and `Xochitl Sarah Millington`, `Kathryn` and
 * `Kathryn Macdonald`. A bare first name shared by two different people will
 * trip this, which is exactly why the result is a question put to the host and
 * not an action taken on her behalf.
 *
 * A single word that matches only a *later* word of the other name (`Sarah`
 * against `Xochitl Sarah Millington`) is deliberately NOT a match. Middle names
 * are common and first names are not interchangeable with them; matching there
 * would flag far more pairs than it caught.
 */
export function namesLookAlike(a: string, b: string): boolean {
  const left = nameWords(a);
  const right = nameWords(b);
  if (left.length === 0 || right.length === 0) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.every((word, index) => word === longer[index]);
}

/** A pair of rows the host should look at, with the reason they were paired. */
export interface DuplicateWarning {
  /** The row that came first — the one to keep, by default. */
  keepKey: string;
  /** The row added later, and so the one the remove button is offered on. */
  dropKey: string;
  /** What matched: the delivery address, or just the name. */
  reason: 'target' | 'name';
}

/**
 * Every pair on this list that might be one person twice, earliest-first.
 *
 * Each row is paired with at most ONE earlier row, so three entries for the
 * same person produce two warnings rather than three, and clearing them from
 * the bottom up never leaves a warning pointing at a row that is already gone.
 *
 * `target` matches are certainties the wizard should have refused at the door;
 * they appear here anyway so a list assembled before this shipped — or arriving
 * through an import — still gets checked before it goes out.
 */
export function likelyDuplicates(list: readonly DedupeTarget[]): DuplicateWarning[] {
  const warnings: DuplicateWarning[] = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const earlier = list[j];
      const later = list[i];
      // Names are compared even when both rows carry a real address, because
      // the duplicate that prompted this was exactly that shape: one profile,
      // one phone number, one human. Two different addresses is evidence that
      // they are two people, but it is not proof, and the host can see in a
      // glance what no comparison here can.
      const reason: DuplicateWarning['reason'] | null = sameTarget(earlier, later)
        ? 'target'
        : namesLookAlike(earlier.name, later.name)
          ? 'name'
          : null;
      if (!reason) continue;
      warnings.push({ keepKey: earlier.key, dropKey: later.key, reason });
      break;
    }
  }
  return warnings;
}
