import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('maps a new poll idea to its own category, not to "plans"', () => {
    // The whole point of the category: a brainstorm arrives in bursts, and
    // muting it must not also mute invitations and cancellations.
    expect(categoryForKind('poll_suggestion')).toBe('suggestions');
  });

  it('maps reminders, messages, and social kinds', () => {
    expect(categoryForKind('reminder')).toBe('reminders');
    expect(categoryForKind('event_comment')).toBe('messages');
    expect(categoryForKind('photo')).toBe('messages');
    expect(categoryForKind('connection_request')).toBe('social');
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

  it('defines a preference for exactly the categories that exist', () => {
    expect(Object.keys(DEFAULT_NOTIFICATION_PREFS).sort()).toEqual(
      NOTIFICATION_CATEGORIES.map((c) => c.key).sort(),
    );
  });
});

/**
 * A category is only real if all four surfaces know about it: the settings page
 * reads the column, the save action writes it, the push gate consults it, and
 * the master switch sweeps it. Adding the fifth category turned up a master
 * switch still listing the original four by hand — it would have left the new
 * toggle stranded, on forever, which is the exact failure the toggle exists to
 * prevent. These read the source so the next category can't repeat it.
 */
describe('every category is wired end to end', () => {
  const SRC = join(process.cwd(), 'src');
  const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

  const settingsPage = read('app/settings/page.tsx');
  const profileActions = read('lib/actions/profile.ts');
  const notifyServer = read('lib/server/notify.ts');
  const prefsComponent = read('components/settings/NotificationPreferences.tsx');

  for (const category of NOTIFICATION_CATEGORIES) {
    it(`${category.key}: settings reads it, the action writes it, push gates on it`, () => {
      // Fetched from the profile and handed to the toggles.
      expect(settingsPage).toContain(category.column);
      expect(settingsPage).toContain(`${category.key}: profile?.${category.column}`);
      // Persisted when the user saves.
      expect(profileActions).toContain(
        `${category.column}: Boolean(prefs.${category.key})`,
      );
      // Consulted before a push goes out — the column must be in the select,
      // or columnForCategory() would read undefined and never suppress.
      expect(notifyServer).toContain(category.column);
    });
  }

  it('sweeps every category from the master switch, without a hand-written list', () => {
    // A literal like `{ plans: value, reminders: value, ... }` silently omits
    // any category added later.
    expect(prefsComponent).not.toMatch(/update\(\{\s*plans:\s*value/);
    expect(prefsComponent).toMatch(/NOTIFICATION_CATEGORIES\.map\(\(c\) => \[c\.key, value\]\)/);
  });
});
