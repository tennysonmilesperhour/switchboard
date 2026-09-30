import { describe, expect, test } from 'vitest';
import { selectBottomOverlay } from './BottomOverlaySlot';

describe('bottom overlay arbitration', () => {
  test('shows exactly the highest-priority active prompt', () => {
    expect(selectBottomOverlay([
      { id: 'pmf', priority: 10 },
      { id: 'install', priority: 20 },
      { id: 'notifications', priority: 30 },
    ])).toBe('notifications');
    expect(selectBottomOverlay([{ id: 'install', priority: 20 }])).toBe('install');
    expect(selectBottomOverlay([])).toBeNull();
  });

  test('keeps unsaved Settings above the update toast, and the toast above the nudges', () => {
    // The update toast used to sit on top of the Settings save bar, and its one
    // button reloads the page — the fastest way to lose the edits underneath.
    expect(selectBottomOverlay([
      { id: 'update', priority: 40 },
      { id: 'settings', priority: 100 },
      { id: 'notifications', priority: 30 },
    ])).toBe('settings');
    expect(selectBottomOverlay([
      { id: 'update', priority: 40 },
      { id: 'notifications', priority: 30 },
      { id: 'install', priority: 20 },
    ])).toBe('update');
  });

  test('breaks equal-priority ties deterministically', () => {
    const claims = [
      { id: 'pmf' as const, priority: 10 },
      { id: 'install' as const, priority: 10 },
    ];
    expect(selectBottomOverlay(claims)).toBe('install');
    expect(selectBottomOverlay([...claims].reverse())).toBe('install');
  });
});
