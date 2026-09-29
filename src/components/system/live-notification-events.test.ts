import { describe, expect, it } from 'vitest';
import { freshNotificationMoment } from './live-notification-events';

describe('freshNotificationMoment', () => {
  it('treats a new unread row as news', () => {
    expect(
      freshNotificationMoment({ id: 'n1', read_at: null, created_at: '2026-09-29T10:00:00Z' }),
    ).toBe('n1:2026-09-29T10:00:00Z');
  });

  it('treats a bumped unread row as a new moment, so the rooms inbox keeps updating', () => {
    const first = freshNotificationMoment({ id: 'n1', read_at: null, created_at: '2026-09-29T10:00:00Z' });
    const bump = freshNotificationMoment({ id: 'n1', read_at: null, created_at: '2026-09-29T10:05:00Z' });

    expect(bump).not.toBe(first);
  });

  it('does not raise a banner when a row is marked read', () => {
    expect(
      freshNotificationMoment({
        id: 'n1',
        read_at: '2026-09-29T10:06:00Z',
        created_at: '2026-09-29T10:05:00Z',
      }),
    ).toBeNull();
  });

  it('ignores a payload without an id', () => {
    expect(freshNotificationMoment({ read_at: null })).toBeNull();
  });
});
