import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_CATEGORIES,
  DEFAULT_NOTIFICATION_PREFS,
  categoryForKind,
  columnForCategory,
} from './notifications';

describe('categoryForKind', () => {
  it('maps plan-related kinds to "plans"', () => {
    for (const kind of [
      'event_invite',
      'rsvp_accepted',
      'join_request',
      'join_approved',
      'event_updated',
      'event_cancelled',
    ]) {
      expect(categoryForKind(kind)).toBe('plans');
    }
  });

  it('maps reminders, messages, and social kinds', () => {
    expect(categoryForKind('reminder')).toBe('reminders');
    expect(categoryForKind('event_comment')).toBe('messages');
    expect(categoryForKind('photo')).toBe('messages');
    expect(categoryForKind('connection_accepted')).toBe('social');
    expect(categoryForKind('match')).toBe('social');
    expect(categoryForKind('interest_received')).toBe('social');
    expect(categoryForKind('moment')).toBe('social');
    expect(categoryForKind('ritual')).toBe('social');
  });

  it('returns null for an unknown kind (treated as always-allowed)', () => {
    expect(categoryForKind('brand_new_kind')).toBeNull();
    expect(categoryForKind('')).toBeNull();
  });
});

describe('category metadata', () => {
  it('every category resolves back to its own column', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(columnForCategory(category.key)).toBe(category.column);
    }
  });

  it('defaults have every category enabled', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(DEFAULT_NOTIFICATION_PREFS[category.key]).toBe(true);
    }
  });

  it('uses distinct keys and columns', () => {
    const keys = NOTIFICATION_CATEGORIES.map((c) => c.key);
    const columns = NOTIFICATION_CATEGORIES.map((c) => c.column);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(columns).size).toBe(columns.length);
  });
});
