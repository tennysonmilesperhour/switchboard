import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_UNFURL_DESCRIPTION,
  directInvitePath,
  inviteOpenGraph,
  unfurlSummary,
} from './invite-links';

describe('directInvitePath', () => {
  test('uses the token route for registered and guest invite delivery', () => {
    expect(directInvitePath('event-id', 'invite-token')).toBe('/rsvp/invite-token');
  });

  test('keeps old rows without a token reachable through the event route', () => {
    expect(directInvitePath('legacy-event', null)).toBe('/events/legacy-event');
  });
});

describe('unfurlSummary', () => {
  test('prefers the host\u2019s own words', () => {
    expect(
      unfurlSummary({ description: '  Dumplings and a long walk after.  ', location_name: 'Mei Wei' }),
    ).toBe('Dumplings and a long walk after.');
  });

  test('falls back to the place when there is no description', () => {
    expect(unfurlSummary({ description: '   ', location_name: 'Mei Wei' })).toBe('Mei Wei');
  });

  test('returns nothing when the plan says neither', () => {
    expect(unfurlSummary({ description: null, location_name: null })).toBeNull();
  });
});

describe('inviteOpenGraph', () => {
  /**
   * The bug this exists to prevent. Next merges metadata shallowly, so a route
   * exporting `openGraph` replaces the root layout's object outright; the two
   * invite routes listed a title and an image and so unfurled with no
   * description, no `og:type` and no site name \u2014 on exactly the two links
   * people paste into a message thread.
   */
  test('always carries the branding fields a page-level openGraph would drop', () => {
    const card = inviteOpenGraph({ title: 'You\u2019re invited: Dumplings' });
    expect(card.type).toBe('website');
    expect(card.siteName).toBe('Switchboard');
    expect(card.description).toBe(APP_UNFURL_DESCRIPTION);
  });

  test('uses the plan\u2019s summary when the link may reveal it', () => {
    const card = inviteOpenGraph({
      title: 'You\u2019re invited: Dumplings',
      description: 'Dumplings and a long walk after.',
      image: '/api/og/event/abc',
    });
    expect(card.description).toBe('Dumplings and a long walk after.');
    expect(card.images).toEqual(['/api/og/event/abc']);
  });

  test('says nothing of a plan that must not unfurl its details', () => {
    const card = inviteOpenGraph({ title: 'You\u2019re invited', description: null, image: null });
    expect(card.description).toBe(APP_UNFURL_DESCRIPTION);
    expect(card.images).toEqual([]);
  });

  test('caps a long description so the card is not a wall of text', () => {
    const card = inviteOpenGraph({ title: 'x', description: 'a'.repeat(400) });
    expect(card.description).toHaveLength(200);
  });

  /**
   * Both invite routes have to ask this module. A route that hand-rolls
   * `openGraph` again is the same drop, reintroduced.
   */
  test.each([
    'src/app/i/[token]/page.tsx',
    'src/app/rsvp/[token]/page.tsx',
  ])('%s builds its unfurl here rather than inline', (route) => {
    const source = readFileSync(join(process.cwd(), route), 'utf-8');
    expect(source).toContain('inviteOpenGraph(');
    expect(source).not.toMatch(/openGraph:\s*\{/);
  });
});
