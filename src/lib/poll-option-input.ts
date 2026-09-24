/**
 * What an idea on a poll may carry, and how loosely typed input becomes it.
 *
 * Pure so the rules can be tested without a database: the server action and
 * the composer both lean on these, and a rule that lived only in one of them
 * would drift from the other.
 */

export const OPTION_LABEL_MAX = 120;
export const OPTION_DETAIL_MAX = 500;
export const OPTION_LINK_MAX = 2048;

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;

export interface OptionFields {
  label: string;
  detail: string | null;
  linkUrl: string | null;
}

export type OptionInputResult =
  | { ok: true; fields: OptionFields }
  | { ok: false; error: string };

/**
 * Turn what someone typed as a link into an address the page can open, or
 * say why it cannot. A bare `example.com/tickets` gets `https://`; anything
 * that is not a web address (`javascript:`, `mailto:`, a stray word) is
 * refused rather than stored and rendered as a dead or dangerous link.
 */
export function normalizeLinkUrl(raw: string | null | undefined): string | null | { error: string } {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: 'That link doesn’t look like a web address.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'Links need to start with http:// or https://.' };
  }
  if (!parsed.hostname.includes('.')) {
    return { error: 'That link doesn’t look like a web address.' };
  }
  if (parsed.href.length > OPTION_LINK_MAX) {
    return { error: 'That link is too long.' };
  }
  return parsed.href;
}

/**
 * Lift a pasted address out of an idea's name.
 *
 * People were writing "Greek Festival: https://…" because the name was the only
 * field. The address is moved into the link field when no link was given, and
 * the name is what is left, minus the separator that joined them. A name that
 * was nothing but a link keeps the site's hostname as its wording, so the card
 * still says something.
 */
export function splitLinkFromLabel(label: string): { label: string; linkUrl: string | null } {
  const match = URL_IN_TEXT.exec(label);
  if (!match) return { label: label.trim(), linkUrl: null };
  const url = match[0].replace(/[.,;:!?)]+$/, '');
  const remainder = label
    .replace(match[0], ' ')
    .replace(/\s*[:\-–—|]\s*$/, '')
    .replace(/^\s*[:\-–—|]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  let hostname = '';
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return { label: label.trim(), linkUrl: null };
  }
  return { label: remainder || hostname, linkUrl: url };
}

/** The hostname a link is shown as, so a card never prints a 200-character URL. */
export function linkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Validate and normalise the fields of an idea, from either the suggestion box
 * or the edit form. The image is deliberately not here: whether an image URL
 * is one of ours is a server question (`isOwnPublicStorageUrl`).
 */
export function prepareOptionFields(input: {
  label: string;
  detail?: string | null;
  linkUrl?: string | null;
}): OptionInputResult {
  const explicitLink = normalizeLinkUrl(input.linkUrl);
  if (explicitLink && typeof explicitLink === 'object') {
    return { ok: false, error: explicitLink.error };
  }
  const split = explicitLink ? { label: input.label.trim(), linkUrl: null } : splitLinkFromLabel(input.label);
  const label = split.label.replace(/\s+/g, ' ').trim();
  if (!label) return { ok: false, error: 'Suggestion is empty' };
  if (label.length > OPTION_LABEL_MAX) {
    return { ok: false, error: `Keep the idea under ${OPTION_LABEL_MAX} characters; the rest can go in the description.` };
  }
  const detail = input.detail?.trim() || null;
  if (detail && detail.length > OPTION_DETAIL_MAX) {
    return { ok: false, error: `Keep the description under ${OPTION_DETAIL_MAX} characters.` };
  }
  return {
    ok: true,
    fields: { label, detail, linkUrl: explicitLink ?? split.linkUrl },
  };
}

/**
 * The form two ideas share when they are the same idea: case, spacing, and
 * trailing punctuation ignored. "Pizza", "pizza " and "Pizza!" are one idea,
 * and letting all three onto the list splits the votes that belong together.
 */
export function ideaKey(label: string): string {
  return label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,!?;:]+$/u, '');
}

/** The existing idea `label` would duplicate, if any (ignoring `exceptId`). */
export function duplicateIdea<T extends { id: string; label: string }>(
  label: string,
  existing: readonly T[],
  exceptId?: string,
): T | null {
  const key = ideaKey(label);
  if (!key) return null;
  return existing.find((option) => option.id !== exceptId && ideaKey(option.label) === key) ?? null;
}
