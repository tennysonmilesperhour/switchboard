import { sanitizeUrl } from '@/lib/url';

export type TextSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string };

// http(s) URLs and bare www. hosts. Trailing punctuation is trimmed below so
// "see https://x.com/a." links the address, not the full stop.
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING = /[.,;:!?'’”)\]}]$/;

/** Drop trailing punctuation, keeping a ")" that closes a "(" inside the URL. */
function trimLink(raw: string): string {
  let link = raw;
  while (TRAILING.test(link)) {
    const last = link[link.length - 1];
    if (last === ')') {
      const opens = link.match(/\(/g)?.length ?? 0;
      const closes = link.match(/\)/g)?.length ?? 0;
      if (closes <= opens) return link;
    }
    link = link.slice(0, -1);
  }
  return link;
}

/**
 * Split message text into plain and link segments. Hrefs go through
 * `sanitizeUrl`, so only http(s) URLs ever become anchors; anything else stays
 * text. Rendered as React elements, never as HTML.
 */
export function linkify(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0;
    const raw = trimLink(match[0]);
    const href = raw ? sanitizeUrl(raw) : null;
    if (!href) continue;
    if (start > cursor) segments.push({ type: 'text', text: text.slice(cursor, start) });
    segments.push({ type: 'link', text: raw, href });
    cursor = start + raw.length;
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
}
