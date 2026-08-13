import { describe, it, expect } from 'vitest';
import { notificationGlyph, bannerFromRow } from './notification-banner';
import { NOTIFICATION_CATEGORIES, categoryForKind } from './notifications';

describe('notificationGlyph', () => {
  it('gives messages and matches a distinct, kind-specific face', () => {
    expect(notificationGlyph('room_message')).toBe('💬');
    expect(notificationGlyph('event_comment')).toBe('💬');
    expect(notificationGlyph('match')).toBe('🎉');
    expect(notificationGlyph('interest_received')).toBe('✨');
    expect(notificationGlyph('reminder')).toBe('⏰');
  });

  it('falls back to the kind’s category emoji when there is no specific face', () => {
    // event_invite has no kind-specific glyph, so it should read as its
    // category ("plans").
    const plans = NOTIFICATION_CATEGORIES.find((c) => c.key === 'plans')!;
    expect(categoryForKind('event_invite')).toBe('plans');
    expect(notificationGlyph('event_invite')).toBe(plans.emoji);
  });

  it('falls back to a neutral bell for an unmapped kind', () => {
    expect(notificationGlyph('some_brand_new_kind')).toBe('🔔');
  });
});

describe('bannerFromRow', () => {
  it('carries the id, title, url through and derives a glyph', () => {
    const banner = bannerFromRow({
      id: 'abc',
      kind: 'match',
      title: 'It’s a match',
      body: 'You both said yes.',
      url: '/mutual',
    });
    expect(banner).toEqual({
      id: 'abc',
      title: 'It’s a match',
      body: 'You both said yes.',
      url: '/mutual',
      glyph: '🎉',
    });
  });

  it('normalises missing body/url to null so the banner renders without a link', () => {
    const banner = bannerFromRow({ id: 'x', kind: 'reminder', title: 'Starting soon' });
    expect(banner.body).toBeNull();
    expect(banner.url).toBeNull();
    expect(banner.glyph).toBe('⏰');
  });
});
