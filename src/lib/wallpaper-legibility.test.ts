import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Text over a photograph, and the one rule that keeps it readable.
 *
 * A custom appearance can put an arbitrary photograph behind the whole app.
 * `theme-custom.ts` handles that by making every surface the app puts text on
 * a PLATE — an opaque box of the palette's own colour — and proves the ink
 * readable against it. That proof has a precondition, stated in its own
 * comment: *"text no longer sits on the bare photo — every text-bearing
 * surface is a plate"*.
 *
 * It was not true. Cards were plates, section headers were plates, and
 * everything else — the wizard's own heading, the notes under a list, the
 * validation lines beside a field — was rendered straight onto the picture.
 * The feedback that followed was exactly one sentence: "I'm still having a
 * hard time seeing this text", circling the largest type on the screen.
 *
 * So the precondition is checked here rather than assumed. For the plan flow —
 * where the report came from, and where a host spends the minutes that decide
 * whether a plan gets sent — every block of text must sit on something:
 *
 * - a class that paints a background (`bg-…`), which the wallpaper CSS swaps
 *   for the matching translucent plate, or
 * - `text-plate`, for text with no surface of its own, or
 * - a component from `PLATED_COMPONENTS`, each of which does one of the above
 *   for its children.
 *
 * The scan is deliberately structural rather than a list of files known to be
 * fine: a list would go stale the first time somebody adds a paragraph, which
 * is precisely how this regressed.
 */

const ROOT = process.cwd();

/** The directories a host walks through to make and manage a plan. */
const SCANNED = ['src/app/events', 'src/components/events'];

/** Block-level text. Inline tags inherit whatever their block sits on. */
const TEXT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const VOID_TAGS = new Set([
  'br', 'img', 'input', 'hr', 'source', 'track', 'area',
  'base', 'col', 'embed', 'link', 'meta', 'param', 'wbr',
]);

/**
 * Anything in a className that means "this element paints its own background".
 * Every one of these is swapped for a plate by the `[data-wallpaper="on"]`
 * rules in `globals.css`.
 */
const SURFACE_CLASS = /\b(bg-[a-z]|text-plate|chrome-bar|skeleton-surface|plate-)/;

/** Components that put their children on a surface. */
const PLATED_COMPONENTS = new Set([
  'Card',
  'SectionHeader',
  'EmptyState',
  'Dialog',
  'ConfirmDialog',
  'ErrorNotice',
  'PlanCard',
  'InviteeSheet',
  'Skeleton',
  'ReorderableList',
  'HostSuggestions',
  'Toast',
]);

interface Tag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: string;
  line: number;
}

/** Comments out, line numbers intact. */
function blankComments(source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ');
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blank)
    .replace(/^\s*\/\/.*$/gm, blank);
}

/**
 * Every JSX tag in a file, in source order.
 *
 * Attributes are walked with a brace and quote counter rather than matched by
 * a regex, because the classNames that matter most here are template literals
 * with nested ternaries in them — `` className={`p-2 ${on ? 'bg-card' : ''}`}``
 * — and a regex that stops at the first `}` reads that as the end of the tag
 * and loses the background it was looking for.
 */
function scanTags(source: string): Tag[] {
  const tags: Tag[] = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== '<') continue;
    let cursor = i + 1;
    const closing = source[cursor] === '/';
    if (closing) cursor += 1;
    const nameStart = cursor;
    while (cursor < source.length && /[A-Za-z0-9._]/.test(source[cursor])) cursor += 1;
    const name = source.slice(nameStart, cursor);
    if (!/^[A-Za-z]/.test(name)) continue;

    let depth = 0;
    let quote: string | null = null;
    let end = cursor;
    while (end < source.length) {
      const char = source[end];
      if (quote) {
        if (char === quote && source[end - 1] !== '\\') quote = null;
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
      } else if (char === '>' && depth === 0) {
        break;
      }
      end += 1;
    }
    if (end >= source.length) break;

    tags.push({
      name,
      closing,
      selfClosing: source[end - 1] === '/',
      attrs: source.slice(cursor, end),
      line: source.slice(0, i).split('\n').length,
    });
    i = end;
  }
  return tags;
}

/** Text in this file with nothing but the page background behind it. */
function unplatedText(source: string): string[] {
  const open: Array<{ name: string; surface: boolean }> = [];
  const found: string[] = [];
  for (const tag of scanTags(blankComments(source))) {
    if (tag.closing) {
      for (let i = open.length - 1; i >= 0; i -= 1) {
        if (open[i].name === tag.name) {
          open.length = i;
          break;
        }
      }
      continue;
    }
    const surface = SURFACE_CLASS.test(tag.attrs) || PLATED_COMPONENTS.has(tag.name);
    if (TEXT_TAGS.has(tag.name) && !surface && !open.some((parent) => parent.surface)) {
      found.push(`<${tag.name}> on line ${tag.line}`);
    }
    if (!tag.selfClosing && !VOID_TAGS.has(tag.name)) open.push({ name: tag.name, surface });
  }
  return found;
}

function scannedFiles(): string[] {
  return execFileSync('git', ['ls-files', ...SCANNED.map((dir) => `${dir}/**/*.tsx`)], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((path) => path.endsWith('.tsx'));
}

describe('text over a wallpaper', () => {
  const files = scannedFiles();

  it('finds the plan flow to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s puts every block of text on a surface', (file) => {
    const bare = unplatedText(readFileSync(join(ROOT, file), 'utf8'));
    expect(
      bare,
      `${file}: ${bare.join(', ')} would render on the raw photograph. Add ` +
        '`text-plate text-plate-inset` to the element, or move it onto a Card.',
    ).toEqual([]);
  });
});

describe('the plate utilities themselves', () => {
  const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');

  it('are inert without a wallpaper, so an ordinary theme is untouched', () => {
    // `.text-plate` carries only a radius on its own; the fill and the outset
    // are both behind the attribute.
    const bare = css.match(/\n\.text-plate \{([\s\S]*?)\n\}/);
    expect(bare?.[1]).toContain('border-radius');
    expect(bare?.[1]).not.toContain('background');
    expect(css).toMatch(/\[data-wallpaper="on"\] \.text-plate \{[\s\S]*?--plate-paper/);
    expect(css).not.toMatch(/\n\.text-plate-inset \{/);
  });

  /**
   * The outset has to be paint, not layout. It goes on paragraphs that already
   * carry their own margins, and the padding-plus-negative-margin version it
   * replaced overwrote those — which is why so little of the app was willing
   * to use it.
   */
  it('grow the plate outward without touching the box model', () => {
    const inset = css.match(/\[data-wallpaper="on"\] \.text-plate-inset \{([\s\S]*?)\n\}/);
    expect(inset?.[1]).toContain('box-shadow');
    expect(inset?.[1]).toContain('var(--plate-paper)');
    expect(inset?.[1]).not.toMatch(/\bmargin\b/);
    expect(inset?.[1]).not.toMatch(/\bpadding\b/);
  });

  it('cover the wizard header the feedback was pointing at', () => {
    const frame = readFileSync(
      join(ROOT, 'src/app/events/new/steps/WizardFrame.tsx'),
      'utf8',
    );
    expect(frame).toMatch(/<header[^>]*className="text-plate text-plate-inset/);
  });
});
