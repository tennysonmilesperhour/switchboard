import { createHash, randomUUID } from 'node:crypto';

export type SourceFormat = 'auto' | 'html' | 'ics' | 'trumba_json' | 'ticketmaster';
export interface EventSource {
  id: string; name: string; url: string; format: SourceFormat; city: string;
  time_zone: string; trust_score: number; stale_after_hours: number;
}
export interface ExternalEventInput {
  sourceEventId: string; title: string; description?: string; startsAt: string; endsAt?: string;
  venueName?: string; address?: string; city?: string; category?: string; tags?: string[];
  imageUrl?: string; canonicalUrl: string; ticketUrl?: string; priceLabel?: string;
  isFree?: boolean; ageLabel?: string; accessibility?: string[]; cancelled?: boolean;
  raw?: Record<string, unknown>;
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function cleanText(value: string | undefined, limit = 2_000): string | null {
  if (!value) return null;
  const cleaned = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ').trim().slice(0, limit);
  return cleaned || null;
}

export function safePublicUrl(value: string | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

/** Interpret an offset-free publisher timestamp in its declared IANA zone. */
export function sourceDate(value: string, timeZone: string): Date | null {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00'] = match;
  const desired = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  let guess = desired;
  try {
    for (let pass = 0; pass < 2; pass += 1) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
        minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(guess));
      const get = (type: string) => +(parts.find((part) => part.type === type)?.value ?? 0);
      const rendered = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
      guess += desired - rendered;
    }
    return new Date(guess);
  } catch { return null; }
}

export function normalizeExternalEvent(source: EventSource, event: ExternalEventInput, runId = randomUUID()) {
  const title = cleanText(event.title, 300) ?? '';
  const startsAt = sourceDate(event.startsAt, source.time_zone);
  if (!title || !startsAt) return null;
  const parsedEnd = event.endsAt ? sourceDate(event.endsAt, source.time_zone) : null;
  const endsAt = parsedEnd && parsedEnd >= startsAt ? parsedEnd : startsAt;
  const canonicalUrl = safePublicUrl(event.canonicalUrl, source.url);
  if (!canonicalUrl) return null;
  const ticketUrl = safePublicUrl(event.ticketUrl, source.url);
  const imageUrl = safePublicUrl(event.imageUrl, source.url);
  const venueIdentity = (event.venueName ?? event.address ?? source.city).toLocaleLowerCase();
  const dedupeKey = hash(`${title.toLocaleLowerCase()}|${startsAt.toISOString()}|${venueIdentity}`);
  const sourceEventId = hash(event.sourceEventId.trim() || dedupeKey);
  const now = new Date().toISOString();
  const contentHash = hash(JSON.stringify([title, startsAt.toISOString(), endsAt.toISOString(), event.venueName, canonicalUrl]));
  return {
    canonical: {
      dedupe_key: dedupeKey, title,
      description: cleanText(event.description),
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), time_zone: source.time_zone,
      venue_name: cleanText(event.venueName, 300), address: cleanText(event.address, 500),
      city: cleanText(event.city, 120) ?? source.city, category: cleanText(event.category, 120),
      tags: [...new Set((event.tags ?? []).map((tag) => cleanText(tag, 80)).filter((tag): tag is string => Boolean(tag)))].slice(0, 20), image_url: imageUrl,
      canonical_url: canonicalUrl, ticket_url: ticketUrl, price_label: cleanText(event.priceLabel, 120),
      is_free: event.isFree ?? null, age_label: cleanText(event.ageLabel, 120),
      accessibility: [...new Set((event.accessibility ?? []).map((item) => cleanText(item, 120)).filter((item): item is string => Boolean(item)))].slice(0, 20),
      confidence: source.trust_score, last_seen_at: now, cancelled_at: event.cancelled ? now : null, updated_at: now,
    },
    listing: {
      source_id: source.id, source_event_id: sourceEventId, content_hash: contentHash,
      canonical_url: canonicalUrl, ticket_url: ticketUrl,
      source_status: event.cancelled ? 'cancelled' as const : 'active' as const,
      payload: event.raw ?? {}, last_seen_at: now, last_seen_run: runId,
    },
  };
}
