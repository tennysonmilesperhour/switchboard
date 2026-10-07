import { describe, expect, it } from 'vitest';
import { normalizeExternalEvent, safePublicUrl, sourceDate, type EventSource } from './external-events';

const source: EventSource = {
  id: 'venue', name: 'Venue', url: 'https://venue.example/events', format: 'html', city: 'Salt Lake City',
  time_zone: 'America/Denver', trust_score: 90, stale_after_hours: 30,
};

describe('normalizeExternalEvent', () => {
  it('creates stable identities and resolves relative signup links', () => {
    const input = {
      sourceEventId: 'show-1', title: '  A   Great Show ', startsAt: '2026-10-08T19:00:00-06:00',
      canonicalUrl: '/shows/1', ticketUrl: '/tickets/1', venueName: 'The Room',
    };
    const first = normalizeExternalEvent(source, input)!;
    const second = normalizeExternalEvent(source, input)!;
    expect(first.listing.source_event_id).toBe(second.listing.source_event_id);
    expect(first.canonical.dedupe_key).toBe(second.canonical.dedupe_key);
    expect(first.canonical.title).toBe('A Great Show');
    expect(first.canonical.ticket_url).toBe('https://venue.example/tickets/1');
    expect(first.canonical.city).toBe('Salt Lake City');
  });

  it('rejects events without a valid title or start', () => {
    expect(normalizeExternalEvent(source, { sourceEventId: 'x', title: '', startsAt: 'nope', canonicalUrl: '/' })).toBeNull();
  });

  it('interprets offset-free source times in Mountain Time', () => {
    expect(sourceDate('2026-10-07T10:00:00', 'America/Denver')?.toISOString()).toBe('2026-10-07T16:00:00.000Z');
  });

  it('refuses active and credential-bearing outbound URLs', () => {
    expect(safePublicUrl('javascript:alert(1)', source.url)).toBeNull();
    expect(safePublicUrl('https://user:secret@example.com', source.url)).toBeNull();
  });

  it('removes publisher markup from fields rendered as text', () => {
    const event = normalizeExternalEvent(source, {
      sourceEventId: 'html', title: 'Class &amp; Demo', startsAt: '2026-10-08T19:00:00-06:00',
      canonicalUrl: '/html', venueName: '<a href="https://maps.example">Studio<br>Downtown</a>',
    })!;
    expect(event.canonical.title).toBe('Class & Demo');
    expect(event.canonical.venue_name).toBe('Studio Downtown');
  });
});
