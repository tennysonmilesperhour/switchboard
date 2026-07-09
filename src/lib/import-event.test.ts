import { describe, expect, it } from 'vitest';
import {
  parseEvent,
  parseIcs,
  parseJsonLd,
  isoToDateTimeParts,
} from './import-event';

describe('parseJsonLd', () => {
  it('extracts a schema.org/Event', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Event","name":"Rooftop Dinner",
       "startDate":"2026-07-10T23:00:00Z","endDate":"2026-07-11T01:00:00Z",
       "description":"BYO drinks","location":{"@type":"Place","name":"Ana's Roof"}}
    </script></head></html>`;
    const e = parseJsonLd(html);
    expect(e?.title).toBe('Rooftop Dinner');
    expect(e?.startISO).toBe('2026-07-10T23:00:00Z');
    expect(e?.locationName).toBe("Ana's Roof");
    expect(e?.description).toBe('BYO drinks');
  });

  it('finds an Event inside an @graph array', () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebSite"},{"@type":"MusicEvent","name":"Show","startDate":"2026-08-01T20:00:00Z"}]}
    </script>`;
    expect(parseJsonLd(html)?.title).toBe('Show');
  });

  it('returns null when there is no event', () => {
    expect(parseJsonLd('<script type="application/ld+json">{"@type":"Person"}</script>')).toBeNull();
  });
});

describe('parseEvent (Open Graph fallback)', () => {
  it('uses OG tags when there is no JSON-LD', () => {
    const html = `<meta property="og:title" content="Game Night &amp; Snacks">
      <meta name="og:description" content="Bring a friend">`;
    const e = parseEvent(html, 'text/html');
    expect(e?.title).toBe('Game Night & Snacks');
    expect(e?.description).toBe('Bring a friend');
  });

  it('prefers JSON-LD over OG when both exist', () => {
    const html = `<meta property="og:title" content="OG title">
      <script type="application/ld+json">{"@type":"Event","name":"LD title","startDate":"2026-07-10T23:00:00Z"}</script>`;
    expect(parseEvent(html, 'text/html')?.title).toBe('LD title');
  });
});

describe('parseIcs', () => {
  it('parses a VEVENT', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Taco night',
      'DTSTART:20260710T230000Z',
      'DTEND:20260711T010000Z',
      'LOCATION:1 Main St',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const e = parseIcs(ics);
    expect(e?.title).toBe('Taco night');
    expect(e?.startISO).toBe('2026-07-10T23:00:00Z');
    expect(e?.locationName).toBe('1 Main St');
  });

  it('is used by parseEvent for calendar content', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Hike\r\nDTSTART:20260801T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    expect(parseEvent(ics, 'text/calendar')?.title).toBe('Hike');
  });
});

describe('isoToDateTimeParts', () => {
  it('splits an ISO datetime into date and time (UTC)', () => {
    expect(isoToDateTimeParts('2026-07-10T23:05:00Z', 'UTC')).toEqual({
      date: '2026-07-10',
      time: '23:05',
    });
  });

  it('returns empty for missing/invalid input', () => {
    expect(isoToDateTimeParts(undefined)).toEqual({});
    expect(isoToDateTimeParts('not-a-date')).toEqual({});
  });
});
