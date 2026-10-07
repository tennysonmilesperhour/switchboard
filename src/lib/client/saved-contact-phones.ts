/**
 * Phone numbers of people the reader found by sharing their own contacts, kept
 * on this device only.
 *
 * Sharing contacts with Switchboard matches them against accounts and throws
 * the list away; the server never learns, or stores, a number the person did
 * not hand it themselves. To offer "Text instead" in a conversation, the match
 * result (which already carries the number from the reader's own contact card)
 * is remembered here, in the browser that did the sharing, keyed by the matched
 * profile. Nothing here is identity: it only decides whether to show a link
 * that opens the phone's own messaging app.
 */

const STORAGE_KEY = 'switchboard.contact-phones.v1';
const MAX_ENTRIES = 500;

export interface SavableContactMatch {
  profile: { id: string } | null;
  smsTarget: string | null;
}

function read(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: Record<string, string> = {};
    for (const [id, phone] of Object.entries(parsed)) {
      if (typeof phone === 'string' && /^\+\d{6,15}$/.test(phone)) clean[id] = phone;
    }
    return clean;
  } catch {
    return {};
  }
}

/** Remember the number for each contact that matched an account. */
export function rememberContactPhones(matches: readonly SavableContactMatch[]): void {
  try {
    const next = read();
    for (const match of matches) {
      if (match.profile && match.smsTarget) next[match.profile.id] = match.smsTarget;
    }
    const entries = Object.entries(next).slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage can be blocked or full; "Text instead" simply stays hidden.
  }
}

/** The number saved for this person, or null when none was ever shared. */
export function savedContactPhone(profileId: string): string | null {
  return read()[profileId] ?? null;
}

/** Forget every saved number, e.g. when someone signs out of a shared device. */
export function forgetSavedContactPhones(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}
