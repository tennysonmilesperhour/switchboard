import { createHash } from 'node:crypto';

export type SourceFormat = 'auto' | 'html' | 'ics' | 'trumba_json';

export interface EventSource {
  id: string;
  name: string;
  url: string;
  format: SourceFormat;
  city: string;
}

export interface ExternalEventInput {
  sourceEventId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  venueName?: string;
  address?: string;
  city?: string;
  category?: string;
  tags?: string[];
  imageUrl?: string;
  canonicalUrl: string;
  ticketUrl?: string;
  priceLabel?: string;
  raw?: Record<string, unknown>;
}

export function normalizeExternalEvent(source: EventSource, event: ExternalEventInput) {
  const title = event.title.replace(/\s+/g, ' ').trim().slice(0, 300);
  const startsAt = new Date(event.startsAt);
  if (!title || Number.isNaN(startsAt.getTime())) return null;
  const endsAt = event.endsAt ? new Date(event.endsAt) : startsAt;
  const canonicalUrl = new URL(event.canonicalUrl, source.url).toString();
  const identity = event.sourceEventId.trim() || `${title}|${startsAt.toISOString()}|${event.venueName ?? ''}`;
  const sourceEventId = createHash('sha256').update(identity).digest('hex');
  const dedupeKey = createHash('sha256')
    .update(`${title.toLocaleLowerCase()}|${startsAt.toISOString()}|${(event.venueName ?? event.address ?? source.city).toLocaleLowerCase()}`)
    .digest('hex');
  const contentHash = createHash('sha256')
    .update(JSON.stringify([title, startsAt.toISOString(), endsAt.toISOString(), event.venueName, canonicalUrl]))
    .digest('hex');

  return {
    source_id: source.id,
    source_event_id: sourceEventId,
    dedupe_key: dedupeKey,
    title,
    description: event.description?.replace(/\s+/g, ' ').trim() || null,
    starts_at: startsAt.toISOString(),
    ends_at: Number.isNaN(endsAt.getTime()) ? startsAt.toISOString() : endsAt.toISOString(),
    time_zone: 'America/Denver',
    venue_name: event.venueName?.trim() || null,
    address: event.address?.trim() || null,
    city: event.city?.trim() || source.city,
    category: event.category?.trim() || null,
    tags: [...new Set(event.tags ?? [])].slice(0, 20),
    image_url: event.imageUrl ? new URL(event.imageUrl, source.url).toString() : null,
    canonical_url: canonicalUrl,
    ticket_url: event.ticketUrl ? new URL(event.ticketUrl, source.url).toString() : null,
    price_label: event.priceLabel?.trim() || null,
    content_hash: contentHash,
    raw: event.raw ?? {},
    last_seen_at: new Date().toISOString(),
    cancelled_at: null,
  };
}
