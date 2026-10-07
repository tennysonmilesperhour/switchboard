import { describe, expect, it } from 'vitest';
import { parseIcsEvents, parseJsonLdEvents, parseTrumbaEvents } from './external-event-sources';

const source = { id: 'test', name: 'Test', url: 'https://events.example/calendar', format: 'auto' as const, city: 'Salt Lake City', time_zone: 'America/Denver', trust_score: 80, stale_after_hours: 30 };

describe('external event source parsers', () => {
  it('collects every JSON-LD event and keeps the signup link', () => {
    const html = `<script type="application/ld+json">{"@graph":[
      {"@type":"MusicEvent","@id":"one","name":"First","startDate":"2026-10-08T19:00:00-06:00","url":"/first","offers":{"url":"/buy/first"}},
      {"@type":"Event","name":"Second","startDate":"2026-10-09T18:00:00-06:00","location":{"name":"Studio","address":{"streetAddress":"1 Main","addressLocality":"Salt Lake City","addressRegion":"UT"}}}
    ]}</script>`;
    const events = parseJsonLdEvents(html, source);
    expect(events).toHaveLength(2);
    expect(events[0].ticketUrl).toBe('/buy/first');
    expect(events[1].address).toContain('1 Main');
  });

  it('collects multiple VEVENT records', () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20261008T190000Z\nSUMMARY:One\nURL:https://example.com/one\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nDTSTART:20261009T190000Z\nSUMMARY:Two\nEND:VEVENT\nEND:VCALENDAR`;
    expect(parseIcsEvents(ics, source).map((event) => event.title)).toEqual(['One', 'Two']);
  });

  it('maps Trumba feeds and retains cancellation signals', () => {
    const rows = parseTrumbaEvents(JSON.stringify([{ eventID: 7, title: 'Class', startDateTime: '2026-10-08T18:00:00-06:00', location: 'Studio', permaLinkUrl: 'https://example.com/7', customFields: [{ label: 'Event Type', value: 'Workshop' }] }, { eventID: 8, title: 'Cancelled', startDateTime: '2026-10-08T18:00:00-06:00', canceled: true }]), source);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sourceEventId: '7', category: 'Workshop', venueName: 'Studio' });
    expect(rows[1].cancelled).toBe(true);
  });
});
