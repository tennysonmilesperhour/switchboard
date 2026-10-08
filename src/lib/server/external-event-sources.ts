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
    if (!title || !startsAt) return [];
    const fields = Array.isArray(row.customFields) ? row.customFields : [];
    const custom = (label: string) => fields.find((field) => field && typeof field === 'object' && (field as JsonNode).label === label) as JsonNode | undefined;
    const address = text(custom('Event Location/Address')?.value);
    const category = text(custom('Event Type')?.value);
    const accessibility = fields
      .filter((field) => field && typeof field === 'object' && /access|asl|interpret|wheelchair/i.test(String((field as JsonNode).label ?? '')) && String((field as JsonNode).value).toLowerCase() === 'yes')
      .map((field) => String((field as JsonNode).label));
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
      isFree: row.requiresPayment === false,
      accessibility,
      cancelled: row.canceled === true,
      raw: row,
    }];
  });
}

export function parseTicketmasterEvents(json: string): ExternalEventInput[] {
  const body = JSON.parse(json) as JsonNode;
  const embedded = body._embedded as JsonNode | undefined;
  const rows = Array.isArray(embedded?.events) ? embedded.events : [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as JsonNode;
    const dates = row.dates as JsonNode | undefined;
    const start = dates?.start as JsonNode | undefined;
    const status = dates?.status as JsonNode | undefined;
    const venues = (row._embedded as JsonNode | undefined)?.venues;
    const venue = Array.isArray(venues) && venues[0] && typeof venues[0] === 'object' ? venues[0] as JsonNode : undefined;
    const address = venue?.address as JsonNode | undefined;
    const city = venue?.city as JsonNode | undefined;
    const images = Array.isArray(row.images) ? row.images : [];
    const ranges = Array.isArray(row.priceRanges) ? row.priceRanges : [];
    const firstRange = ranges[0] && typeof ranges[0] === 'object' ? ranges[0] as JsonNode : undefined;
    const title = text(row.name);
    const startsAt = text(start?.dateTime);
    const canonicalUrl = text(row.url);
    if (!title || !startsAt || !canonicalUrl) return [];
    return [{
      sourceEventId: String(row.id ?? canonicalUrl), title, startsAt,
      venueName: text(venue?.name), address: text(address?.line1), city: text(city?.name),
      category: text(((Array.isArray(row.classifications) ? row.classifications[0] : undefined) as JsonNode | undefined)?.segment && (((row.classifications as unknown[])[0] as JsonNode).segment as JsonNode).name),
      imageUrl: text((images[0] as JsonNode | undefined)?.url), canonicalUrl, ticketUrl: canonicalUrl,
      priceLabel: firstRange ? `${firstRange.currency ?? '$'} ${firstRange.min ?? ''}–${firstRange.max ?? ''}` : undefined,
      cancelled: status?.code === 'cancelled', raw: row,
    }];
  });
}

export async function fetchSourceEvents(source: EventSource): Promise<ExternalEventInput[]> {
  let sourceUrl = source.url;
  if (source.format === 'ticketmaster') {
    const key = process.env.TICKETMASTER_API_KEY;
    if (!key) throw new Error('TICKETMASTER_API_KEY is not configured');
    const url = new URL(source.url);
    url.searchParams.set('apikey', key);
    sourceUrl = url.toString();
  }
  if (source.format === 'trumba_json') {
    // Publisher feeds can cap output (the county feed currently caps at 100).
    // Request bounded four-week windows so dense months do not silently hide
    // everything after the first hundred records.
    const today = new Date();
    const windows = Array.from({ length: 6 }, (_, index) => {
      const start = new Date(today.getTime() + index * 28 * 86_400_000);
      const url = new URL(source.url);
      url.searchParams.set('startdate', start.toISOString().slice(0, 10).replaceAll('-', ''));
      url.searchParams.set('weeks', '4');
      url.searchParams.set('previousweeks', '0');
      url.searchParams.set('html', '0');
      return url.toString();
    });
    const pages = await Promise.all(windows.map(async (url) => {
      const page = await safeFetchText(url, { maxBytes: MAX_SOURCE_BYTES, accept: 'application/json' });
      if (!page.ok || page.body === undefined) throw new Error(`Trumba page fetch failed: ${page.reason ?? 'unknown'}`);
      return parseTrumbaEvents(page.body, source);
    }));
    return [...new Map(pages.flat().map((event) => [event.sourceEventId, event])).values()];
  }
  const fetched = await safeFetchText(sourceUrl, {
    maxBytes: MAX_SOURCE_BYTES,
    accept: 'text/html,text/calendar,application/json,application/xhtml+xml',
  });
  if (!fetched.ok || fetched.body === undefined) {
    throw new Error(`Source fetch failed: ${fetched.reason ?? 'unknown'}`);
  }
  if (source.format === 'ticketmaster') return parseTicketmasterEvents(fetched.body);
  if (source.format === 'ics' || /text\/calendar/i.test(fetched.contentType ?? '') || /^BEGIN:VCALENDAR/im.test(fetched.body)) {
    return parseIcsEvents(fetched.body, source);
  }
  return parseJsonLdEvents(fetched.body, source);
}
