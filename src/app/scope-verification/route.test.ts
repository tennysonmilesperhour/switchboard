import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * The client walks this checklist from a link they were given. It was deleted
 * once already, and the CSP would silently empty it if the nonce were dropped.
 */
describe('GET /scope-verification', () => {
  it('serves the checklist with every inline script carrying the request nonce', async () => {
    const request = new Request('https://switchboardsocial.me/scope-verification', {
      headers: { 'x-nonce': 'abc123' },
    });
    const response = await GET(request as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Scope of Work Verification');
    expect(html).toContain('September 2026 feedback round');
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain('<script nonce="abc123">');
    expect(html).not.toContain('<script src=');
  });
});

const HTML = readFileSync(
  join(process.cwd(), 'docs/scope-of-work-verification.html'),
  'utf8',
);

function inlineScript(): string {
  const match = /<script[^>]*>([\s\S]*?)<\/script>/.exec(HTML);
  expect(match, 'the checklist has no inline script').not.toBeNull();
  return match![1];
}

interface ChecklistItem {
  id: string;
  name: string;
  what: string;
  verify: string;
}
interface ChecklistGroup {
  id: string;
  title: string;
  blurb: string;
  items: ChecklistItem[];
}

/** The `GROUPS` literal, evaluated on its own. It is pure data. */
function groups(): ChecklistGroup[] {
  const script = inlineScript();
  const open = script.indexOf('var GROUPS = [');
  expect(open, 'the checklist declares no GROUPS').toBeGreaterThan(-1);
  const close = script.indexOf('\n  ];', open);
  expect(close, 'the GROUPS literal is never terminated').toBeGreaterThan(open);
  const literal = script.slice(open + 'var GROUPS = '.length, close + '\n  ]'.length);
  return runInNewContext(`(${literal})`) as ChecklistGroup[];
}

/**
 * The list itself, checked by running the page's own code rather than by
 * grepping its text.
 *
 * Every item on this page is drawn by that one inline script, so a single
 * misplaced bracket in the data takes the whole list down — header and
 * progress bar still render, the list is simply empty, and nothing 500s or
 * logs. That is exactly what shipped when the September section was added:
 * its insertion swallowed the `]},` closing the section above it, the script
 * failed to parse, and the client opened a blank checklist. The prior test
 * asserted the new section's *text* was in the file, which it was.
 *
 * So: parse the script, evaluate the data, and read it back.
 */
describe('the checklist itself', () => {
  it('parses as JavaScript', () => {
    // `new Script` compiles without running, which is the whole failure mode:
    // a SyntaxError here is a page that renders nothing in every browser.
    expect(() => new Script(inlineScript())).not.toThrow();
  });

  it('builds every section as a top-level group', () => {
    const ids = groups().map((group) => group.id);
    // Nesting a section inside the previous one's `items` is the shape the
    // bracket bug produced, so assert the sections are siblings by name.
    expect(ids).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every item an id, a name, a description, and a way to try it', () => {
    const items = groups().flatMap((group) => {
      expect(group.title, `group ${group.id} has no title`).toBeTruthy();
      expect(group.blurb, `group ${group.id} has no blurb`).toBeTruthy();
      expect(group.items.length, `group ${group.id} has no items`).toBeGreaterThan(0);
      return group.items;
    });
    for (const item of items) {
      for (const field of ['id', 'name', 'what', 'verify'] as const) {
        expect(typeof item[field], `${item.id ?? '(no id)'}.${field}`).toBe('string');
        expect(item[field]?.trim(), `${item.id ?? '(no id)'}.${field} is empty`).toBeTruthy();
      }
    }
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size, 'duplicate item ids').toBe(ids.length);
  });

  it('keeps storing progress under the key readers already have', () => {
    // The ticks are mirrored in the reader's own browser under this key, and
    // renaming it is how the list once came up empty for the one person who was
    // part-way through. Item ids are stable and additive: a new section never
    // needs a new key. Any key retired in the past must stay listed as legacy so
    // its ticks are folded back in instead of stranded.
    const script = inlineScript();
    expect(script).toContain('var KEY = "swb-scope-v4"');

    // Keys with their own job, which are not retired progress keys. Each one is
    // listed deliberately so that an *unexplained* new key still fails here.
    const purposeful = new Set([
      // Whether this browser's pre-board ticks were folded up once already.
      'swb-scope-pushed-v1',
      // Writes that failed to reach the board, replayed on the next load.
      'swb-scope-pending-v1',
      // Whatever name the reader typed, so the board can attribute a tick.
      'swb-scope-name',
    ]);

    const mentioned = [...script.matchAll(/"(swb-scope-[\w.-]+)"/g)].map((m) => m[1]);
    const legacy = /var LEGACY_KEYS = \[([^\]]*)\]/.exec(script)?.[1] ?? '';
    for (const key of new Set(mentioned)) {
      if (key === 'swb-scope-v4' || purposeful.has(key)) continue;
      expect(
        legacy,
        `${key} is referenced but neither recovered as a legacy key nor listed as purposeful`,
      ).toContain(key);
    }
  });

  it('reads and writes the shared board, not just this browser', () => {
    // The complaint that prompted this: progress lived in localStorage and so
    // never reached the person who sent the link. A page that only stores
    // locally would look identical to a working one from the server's side, so
    // assert the calls are actually there.
    const script = inlineScript();
    expect(script).toContain('/api/scope-progress');
    expect(script, 'ticks must be pushed, not just stored').toContain('function postTick');
    expect(script, 'the board must be read on load').toContain('function loadBoard');
    expect(script, 'notes must be rendered for anyone with the link').toContain(
      'function renderNotes',
    );
    // Whatever was already ticked in this browser has to reach the server once,
    // or the client silently loses the walk she already did.
    expect(script).toContain('function pushLocalBacklog');
  });

  it('does not promise privacy it no longer provides', () => {
    // The feedback box used to say screenshots were private. The board now
    // publishes them to anyone holding the link, so that sentence would be a
    // false assurance to the person typing into it.
    expect(HTML).not.toContain('Screenshots are private');
    expect(HTML).toContain('Anyone with this link can see what you post here');
  });
});
