/**
 * Classify a free-typed invitee entry so the host can add anyone the same way
 * they'd add them anywhere else: a Switchboard handle, an email, a phone
 * number, or just a name for an off-platform guest.
 *
 * Pure and deterministic — the DB resolution (does this handle/email/phone
 * belong to a real profile?) happens in the server action; here we only decide
 * what kind of thing the host typed.
 */

import { looksLikeEmail } from '@/lib/server/email';
import { normalizePhoneNumber } from '@/lib/phone';

export type InviteEntryKind = 'handle' | 'email' | 'phone' | 'name';

export interface ParsedInviteEntry {
  kind: InviteEntryKind;
  /**
   * Normalized value: handle without a leading @, a lowercased email, an E.164
   * phone number, or a trimmed display name.
   */
  value: string;
  /** How to show the entry back to the host in a chip. */
  display: string;
}

const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

/**
 * Parse one raw entry. Handles must be written with a leading `@` so a bare
 * word is unambiguously treated as a guest's name; email and phone are detected
 * by shape. Returns null for blank input, and for an `@`-prefixed token that
 * isn't a well-formed handle (so the caller can flag it).
 */
export function parseInviteEntry(raw: string): ParsedInviteEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1).trim().toLowerCase();
    if (!HANDLE_PATTERN.test(handle)) return null;
    return { kind: 'handle', value: handle, display: `@${handle}` };
  }

  // Assign the guard's result to a local so it doesn't narrow `trimmed` to
  // `never` in the fall-through (looksLikeEmail is a `value is string` guard).
  const email = looksLikeEmail(trimmed) ? trimmed.toLowerCase() : null;
  if (email) {
    return { kind: 'email', value: email, display: email };
  }

  const phone = normalizePhoneNumber(trimmed);
  if (phone) {
    return { kind: 'phone', value: phone, display: trimmed };
  }

  const name = trimmed.slice(0, 80);
  return { kind: 'name', value: name, display: name };
}

/** Parse a batch, dropping blanks and de-duplicating by kind+value. */
export function parseInviteEntries(raws: string[]): ParsedInviteEntry[] {
  const seen = new Set<string>();
  const out: ParsedInviteEntry[] = [];
  for (const raw of raws) {
    const parsed = parseInviteEntry(raw);
    if (!parsed) continue;
    const key = `${parsed.kind}:${parsed.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}
