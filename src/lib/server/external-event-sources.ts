import 'server-only';

import { parseIcs } from '@/lib/import-event';
import type { EventSource, ExternalEventInput } from '@/lib/external-events';
import { safeFetchText } from '@/lib/server/safe-fetch';

const MAX_SOURCE_BYTES = 4_000_000;

type JsonNode = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function eventNodes(value: unknown): JsonNode[] {
  if (Array.isArray(value)) return value.flatMap(eventNodes);
  if (!value || typeof value !== 'object') return [];
  const node = value as JsonNode;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  const here = types.some((type) => typeof type === 'string' && /Event$/i.test(type)) ? [node] : [];
  return [...here, ...eventNodes(node['@graph'])];
}

function location(node: JsonNode): { venueName?: string; address?: string; city?: string } {
  const value = Array.isArray(node.location) ? node.location[0] : node.location;
  if (typeof value === 'string') return { venueName: value };
  if (!value || typeof value !== 'object') return {};
  const place = value as JsonNode;
  const address = place.address;
  if (typeof address === 'string') return { venueName: text(place.name), address };
  if (!address || typeof address !== 'object') return { venueName: text(place.name) };
  const parts = address as JsonNode;
  return {
    venueName: text(place.name),
    address: [parts.streetAddress, parts.addressLocality, parts.addressRegion, parts.postalCode]
      .map(text).filter(Boolean).join(', ') || undefined,
    city: text(parts.addressLocality),
  };
}

function offerUrl(node: JsonNode): string | undefined {
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  return offers && typeof offers === 'object' ? text((offers as JsonNode).url) : undefined;
}

function imageUrl(node: JsonNode): string | undefined {
  const image = Array.isArray(node.image) ? node.image[0] : node.image;
  if (typeof image === 'string') return image;
  return image && typeof image === 'object' ? text((image as JsonNode).url) : undefined;
}

export function parseJsonLdEvents(html: string, source: EventSource): ExternalEventInput[] {
  const events: ExternalEventInput[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const node of eventNodes(JSON.parse(match[1]))) {
        const title = text(node.name);
        const startsAt = text(node.startDate);
        if (!title || !startsAt) continue;
        const where = location(node);
        const canonicalUrl = text(node.url) ?? source.url;
        events.push({
          sourceEventId: text(node['@id']) ?? canonicalUrl,
          title,
          description: text(node.description),
          startsAt,
          endsAt: text(node.endDate),
          ...where,
          category: text(node.eventType),
          imageUrl: imageUrl(node),
          canonicalUrl,
          ticketUrl: offerUrl(node),
          raw: node,
        });
      }
    } catch {
      // One malformed publisher block must not discard valid blocks after it.
    }
  }
  return events;
}

export function parseIcsEvents(calendar: string, source: EventSource): ExternalEventInput[] {
  const chunks = calendar.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) ?? [];
  return chunks.flatMap((chunk, index) => {
    const parsed = parseIcs(`BEGIN:VCALENDAR\n${chunk}\nEND:VCALENDAR`);
    if (!parsed?.title || !parsed.startISO) return [];
    const unfolded = chunk.replace(/\r?\n[ \t]/g, '');
    const field = (name: string) => unfolded.match(new RegExp(`^${name}[^:\\r\\n]*:(.*)$`, 'im'))?.[1]?.trim();
    return [{
      sourceEventId: field('UID') ?? `${parsed.title}|${parsed.startISO}|${index}`,
      title: parsed.title,
      description: parsed.description,
      startsAt: parsed.startISO,
      endsAt: parsed.endISO,
      venueName: parsed.locationName,
      canonicalUrl: field('URL') ?? source.url,
    }];
  });
}

export function parseTrumbaEvents(json: string, source: EventSource): ExternalEventInput[] {
  const rows = JSON.parse(json) as unknown;
  if (!Array.isArray(rows)) throw new Error('Trumba source did not return an event list');
  return rows.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as JsonNode;
    const title = text(row.title);
    const startsAt = text(row.startDateTime);
    if (!title || !startsAt || row.canceled === true) return [];
    const fields = Array.isArray(row.customFields) ? row.customFields : [];
    const custom = (label: string) => fields.find((field) => field && typeof field === 'object' && (field as JsonNode).label === label) as JsonNode | undefined;
    const address = text(custom('Event Location/Address')?.value);
    const category = text(custom('Event Type')?.value);
    return [{
      sourceEventId: String(row.eventID ?? row.permaLinkUrl ?? `${title}|${startsAt}`),
      title,
      description: text(row.description)?.replace(/<[^>]*>/g, ' '),
      startsAt,
      endsAt: text(row.endDateTime),
      venueName: text(row.location),
      address,
      category,
      canonicalUrl: text(row.permaLinkUrl) ?? source.url,
      ticketUrl: text(row.webLink) || text(row.eventActionUrl),
      raw: row,
    }];
  });
}

export async function fetchSourceEvents(source: EventSource): Promise<ExternalEventInput[]> {
  const fetched = await safeFetchText(source.url, {
    maxBytes: MAX_SOURCE_BYTES,
    accept: 'text/html,text/calendar,application/xhtml+xml',
  });
  if (!fetched.ok || fetched.body === undefined) {
    throw new Error(`Source fetch failed: ${fetched.reason ?? 'unknown'}`);
  }
  if (source.format === 'trumba_json') return parseTrumbaEvents(fetched.body, source);
  if (source.format === 'ics' || /text\/calendar/i.test(fetched.contentType ?? '') || /^BEGIN:VCALENDAR/im.test(fetched.body)) {
    return parseIcsEvents(fetched.body, source);
  }
  return parseJsonLdEvents(fetched.body, source);
}
