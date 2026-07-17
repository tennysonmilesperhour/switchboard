import type { ContactCandidate } from '@/lib/actions/connections';

/**
 * Minimal vCard (2.1 / 3.0 / 4.0) reader used as the desktop fallback for the
 * Contact Picker API.
 *
 * `navigator.contacts.select` only exists in Chrome/Edge on Android, so on
 * desktop Safari/Chrome (and iOS Safari, Firefox) the native picker is never
 * available. Instead users export a contact card (.vcf) from their phone,
 * email, or Contacts app; we pull out each card's name / emails / phones and
 * hand them to the same `resolveContactMatches` pipeline the native picker
 * feeds.
 *
 * Parsing is deliberately lossy — we only need FN/N, EMAIL and TEL — and
 * tolerant of the format quirks real exporters produce (folded lines, Apple
 * `item1.` group prefixes, `tel:`/`mailto:` URI values, CRLF or bare LF).
 * Everything here is best-effort text extraction; the values are re-cleaned
 * and rate-limited server-side before any lookup happens.
 */

/** Unescape a property value per RFC 6350 §3.4 in a single pass. */
function unescapeValue(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_match, ch: string) =>
    ch === 'n' || ch === 'N' ? '\n' : ch,
  );
}

/** Split on unescaped occurrences of `delimiter` (so `\;` stays literal). */
function splitUnescaped(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) {
      buffer += ch + value[i + 1];
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      parts.push(buffer);
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  parts.push(buffer);
  return parts;
}

/**
 * Unfold physical lines into logical ones. A line beginning with a space or
 * tab is a continuation of the previous line (RFC 6350 §3.2). Also strips a
 * leading BOM and tolerates CRLF, CR, or LF endings.
 */
function unfoldLines(text: string): string[] {
  const rawLines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const raw of rawLines) {
    if (lines.length > 0 && (raw.startsWith(' ') || raw.startsWith('\t'))) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

interface ParsedLine {
  name: string;
  value: string;
}

/** Split a logical line into its property name (group + params stripped) and value. */
function parseLine(line: string): ParsedLine | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  // Property name ends at the first ';' (which starts parameters).
  const semi = head.indexOf(';');
  let namePart = semi === -1 ? head : head.slice(0, semi);
  // Drop an Apple-style group prefix, e.g. "item1.EMAIL" -> "EMAIL".
  const dot = namePart.lastIndexOf('.');
  if (dot !== -1) namePart = namePart.slice(dot + 1);
  return { name: namePart.trim().toUpperCase(), value };
}

function nameFromStructured(value: string): string {
  // N: Family;Given;Additional;Prefix;Suffix
  const [family = '', given = '', additional = ''] = splitUnescaped(value, ';').map((part) =>
    unescapeValue(part).trim(),
  );
  return [given, additional, family].filter(Boolean).join(' ').trim();
}

/**
 * Parse the text of a .vcf file into contact candidates. Cards with nothing to
 * match on (no name, email, or phone) are dropped.
 */
export function parseVCards(text: string): ContactCandidate[] {
  const cards: ContactCandidate[] = [];
  let current: ContactCandidate | null = null;
  let structuredName = '';

  for (const line of unfoldLines(text)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, value } = parsed;

    if (name === 'BEGIN' && value.trim().toUpperCase() === 'VCARD') {
      current = { name: '', emails: [], phones: [] };
      structuredName = '';
      continue;
    }
    if (name === 'END' && value.trim().toUpperCase() === 'VCARD') {
      if (current) {
        if (!current.name) current.name = structuredName;
        if (current.name || current.emails.length > 0 || current.phones.length > 0) {
          cards.push(current);
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    switch (name) {
      case 'FN': {
        const fn = unescapeValue(value).trim();
        if (fn) current.name = fn;
        break;
      }
      case 'N': {
        structuredName = nameFromStructured(value);
        break;
      }
      case 'EMAIL': {
        const email = unescapeValue(value).trim().replace(/^mailto:/i, '');
        if (email) current.emails.push(email);
        break;
      }
      case 'TEL': {
        const tel = unescapeValue(value).trim().replace(/^tel:/i, '');
        if (tel) current.phones.push(tel);
        break;
      }
      default:
        break;
    }
  }

  return cards;
}
