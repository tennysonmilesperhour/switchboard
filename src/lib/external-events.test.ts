import { describe, expect, it } from 'vitest';
import { normalizeExternalEvent, type EventSource } from './external-events';

const source: EventSource = {
  id: 'venue', name: 'Venue', url: 'https://venue.example/events', format: 'html', city: 'Salt Lake City',
};

describe('normalizeExternalEvent', () => {
  it('creates stable identities and resolves relative signup links', () => {
    const input = {
      sourceEventId: 'show-1', title: '  A   Great Show ', startsAt: '2026-10-08T19:00:00-06:00',
      canonicalUrl: '/shows/1', ticketUrl: '/tickets/1', venueName: 'The Room',
    };
    const first = normalizeExternalEvent(source, input)!;
    const second = normalizeExternalEvent(source, input)!;
    expect(first.source_event_id).toBe(second.source_event_id);
    expect(first.dedupe_key).toBe(second.dedupe_key);
    expect(first.title).toBe('A Great Show');
    expect(first.ticket_url).toBe('https://venue.example/tickets/1');
    expect(first.city).toBe('Salt Lake City');
  });

  it('rejects events without a valid title or start', () => {
    expect(normalizeExternalEvent(source, { sourceEventId: 'x', title: '', startsAt: 'nope', canonicalUrl: '/' })).toBeNull();
  });
});
