import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { trappedFocusIndex } from './Dialog';

describe('Dialog keyboard contract', () => {
  test('wraps Tab and Shift+Tab at both ends of the focus ring', () => {
    expect(trappedFocusIndex(2, 3, false)).toBe(0);
    expect(trappedFocusIndex(0, 3, true)).toBe(2);
    expect(trappedFocusIndex(1, 3, false)).toBeNull();
    expect(trappedFocusIndex(1, 3, true)).toBeNull();
    expect(trappedFocusIndex(-1, 0, false)).toBeNull();
  });

  test('keeps the modal requirements in the shared primitive', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/ui/Dialog.tsx'),
      'utf8',
    );
    expect(source).toContain('dialog.showModal()');
    expect(source).toContain("child.inert = true");
    expect(source).toContain('aria-labelledby={labelledBy}');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain('previouslyFocused?.focus()');
  });
});
