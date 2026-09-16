import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pinned layers must not eat taps meant for what is under them.
 *
 * Switchboard stacks several fixed, full-width layers in the same band above
 * the tab bar — toasts, the install prompt, the version watcher, the PMF
 * survey, the notification nudge, the Settings save bar. Each is a wide
 * container holding one narrow pill, so the container covers the whole width of
 * the screen while only the pill is meant to be touchable.
 *
 * The toast host shipped without `pointer-events-none`. It is z-50, pinned at
 * `bottom-24`, and the Settings save bar sits at exactly the same `bottom-24`
 * one layer down — so the toast raised by a failed save covered the Save button
 * that raised it, and the retry tap hit the toast. The button was not broken
 * and nothing in it was wrong to read; the tap never arrived. Every other
 * overlay in the app already had the class, which is what made the one that
 * didn't so hard to see.
 *
 * So: a fixed, full-width layer either opts out of pointer events, or is named
 * here with the reason it is allowed to take them.
 */

/** Layers that are *supposed* to receive taps across their whole width. */
const MEANT_TO_TAKE_TAPS: Record<string, string> = {
  'src/components/ui/Dialog.tsx':
    'the modal itself — a tap on the backdrop outside the panel closes it',
  'src/components/shell/BottomNav.tsx':
    'the tab bar — the bar is the control, not a wrapper around one',
};

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...tsxFiles(full));
    else if (entry.name.endsWith('.tsx')) found.push(full);
  }
  return found;
}

/** A className line that pins a layer across the full width of the viewport. */
function isFullWidthFixedLayer(line: string): boolean {
  return (
    /\bfixed\b/.test(line) &&
    /\b(inset-0|inset-x-0|w-full|w-screen)\b/.test(line) &&
    /class(Name)?=/.test(line)
  );
}

describe('fixed overlay layers', () => {
  const offenders: string[] = [];
  for (const file of tsxFiles(path.join(process.cwd(), 'src'))) {
    const relative = path.relative(process.cwd(), file);
    if (relative in MEANT_TO_TAKE_TAPS) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (!isFullWidthFixedLayer(line)) return;
        if (line.includes('pointer-events-none')) return;
        offenders.push(`${relative}:${index + 1}`);
      });
  }

  it('let taps through to whatever is underneath them', () => {
    expect(offenders).toEqual([]);
  });

  it('keeps the allow-list honest — every exemption still exists', () => {
    for (const file of Object.keys(MEANT_TO_TAKE_TAPS)) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(
        source.split('\n').some(isFullWidthFixedLayer),
        `${file} is exempted but no longer has a fixed full-width layer — drop the exemption`,
      ).toBe(true);
    }
  });
});
