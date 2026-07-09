/**
 * Parse an event out of a competitor's page or an .ics file so a user can bring
 * a plan they made elsewhere (Partiful, Luma, Facebook, Apple Invites, Eventbrite,
 * …) into Switchboard. Best-effort: reads Open Graph tags, schema.org/Event
 * JSON-LD, and iCalendar VEVENTs. Pure and unit-tested; the network fetch lives
 * in the server action.
 */

export interface ParsedEvent {
  title?: string;
  description?: string;
  /** ISO 8601 start, if found. */
  startISO?: string;
  endISO?: string;
  locationName?: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .trim();
}

/** Content of the first <meta property|name="key" content="..."> (either order). */
function metaContent(html: string, key: string): string | undefined {
  const tag = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i'),
  )?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : undefined;
}

type JsonLdNode = Record<string, unknown>;

function findEventNode(node: unknown): JsonLdNode | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as JsonLdNode;
  const type = obj['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === 'string' && /Event$/i.test(t))) return obj;
  if (obj['@graph']) return findEventNode(obj['@graph']);
  return null;
}

function locationName(loc: unknown): string | undefined {
  if (!loc) return undefined;
  if (typeof loc === 'string') return decodeEntities(loc);
  if (Array.isArray(loc)) return locationName(loc[0]);
  if (typeof loc === 'object') {
    const obj = loc as JsonLdNode;
    if (typeof obj.name === 'string') return decodeEntities(obj.name);
    if (typeof obj.address === 'string') return decodeEntities(obj.address);
  }
  return undefined;
}

/** Parse schema.org/Event JSON-LD, if present. */
export function parseJsonLd(html: string): ParsedEvent | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const node = findEventNode(data);
    if (!node) continue;
    return {
      title: typeof node.name === 'string' ? decodeEntities(node.name) : undefined,
      description:
        typeof node.description === 'string'
          ? decodeEntities(node.description)
          : undefined,
      startISO: typeof node.startDate === 'string' ? node.startDate : undefined,
      endISO: typeof node.endDate === 'string' ? node.endDate : undefined,
      locationName: locationName(node.location),
    };
  }
  return null;
}

function icsUnescape(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function icsToISO(value: string): string | undefined {
  // Forms: 20260710T230000Z, 20260710T230000, 20260710
  const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return undefined;
  const [, y, mo, d, hh = '00', mi = '00', ss = '00', z] = m;
  const iso = `${y}-${mo}-${d}T${hh}:${mi}:${ss}${z ? 'Z' : ''}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : iso;
}

/** Parse the first VEVENT out of iCalendar text. */
export function parseIcs(text: string): ParsedEvent | null {
  if (!/BEGIN:VEVENT/i.test(text)) return null;
  // Unfold RFC 5545 line continuations (CRLF + space/tab).
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const field = (name: string) =>
    unfolded.match(new RegExp(`^${name}[^:\\r\\n]*:(.*)$`, 'im'))?.[1]?.trim();

  const dtstart = field('DTSTART');
  const dtend = field('DTEND');
  const summary = field('SUMMARY');
  return {
    title: summary ? icsUnescape(summary) : undefined,
    description: field('DESCRIPTION') ? icsUnescape(field('DESCRIPTION')!) : undefined,
    locationName: field('LOCATION') ? icsUnescape(field('LOCATION')!) : undefined,
    startISO: dtstart ? icsToISO(dtstart) : undefined,
    endISO: dtend ? icsToISO(dtend) : undefined,
  };
}

/**
 * Parse an event from fetched content. JSON-LD wins (richest), then falls back
 * to Open Graph tags; ICS is tried when the content looks like a calendar.
 */
export function parseEvent(content: string, contentType = ''): ParsedEvent | null {
  if (/text\/calendar/i.test(contentType) || /^BEGIN:VCALENDAR/im.test(content)) {
    const ics = parseIcs(content);
    if (ics?.title || ics?.startISO) return ics;
  }

  const jsonLd = parseJsonLd(content);
  const og: ParsedEvent = {
    title: metaContent(content, 'og:title') ?? undefined,
    description: metaContent(content, 'og:description') ?? undefined,
  };

  const merged: ParsedEvent = {
    title: jsonLd?.title ?? og.title,
    description: jsonLd?.description ?? og.description,
    startISO: jsonLd?.startISO,
    endISO: jsonLd?.endISO,
    locationName: jsonLd?.locationName,
  };
  return merged.title || merged.startISO ? merged : null;
}

/** Split an ISO datetime into the wizard's date (YYYY-MM-DD) and time (HH:MM),
 *  in the given IANA timezone (defaults to the server's). */
export function isoToDateTimeParts(
  iso: string | undefined,
  timeZone?: string,
): { date?: string; time?: string } {
  if (!iso) return {};
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return {};
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      time: `${hour}:${get('minute')}`,
    };
  } catch {
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) || undefined };
  }
}
