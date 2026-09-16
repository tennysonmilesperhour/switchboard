import { describe, expect, it } from 'vitest';
import {
  copyOnlyChange,
  copyOnlyChangeset,
  isProtectedPath,
  literalChangeIsSafe,
} from './copy-only';

/**
 * This module decides what the twice-daily feedback job may merge to `main`
 * without a human reading it. Everything it lets through reaches real users
 * unattended, so the tests below are weighted towards the refusals: a false
 * "copy-only" ships code nobody reviewed, while a false "needs a human" costs
 * nothing but a pull request.
 *
 * The cases are written as the diffs they actually are.
 */

const yes = (path: string, before: string | null, after: string | null) =>
  copyOnlyChange(path, before, after).copyOnly;

const why = (path: string, before: string | null, after: string | null) =>
  copyOnlyChange(path, before, after).reason;

describe('what counts as words only', () => {
  it('lets a typo in a string through', () => {
    // The exact fix the client asked for: "Geek festival" → "Greek festival".
    expect(
      yes(
        'src/components/polls/PollSection.tsx',
        'const label = "Geek festival";',
        'const label = "Greek festival";',
      ),
    ).toBe(true);
  });

  it('lets JSX text through', () => {
    expect(
      yes(
        'src/app/page.tsx',
        'export const A = () => <p>Who is around</p>;',
        'export const A = () => <p>Who’s around right now</p>;',
      ),
    ).toBe(true);
  });

  it('lets a template literal’s words through', () => {
    expect(
      yes(
        'src/lib/copy.ts',
        'const m = `${n} people are coming`;',
        'const m = `${n} people said yes`;',
      ),
    ).toBe(true);
  });

  it('treats markdown as prose, whatever is in it', () => {
    expect(yes('docs/DOCKET.md', '# Old\n\nthing', '# New\n\nother thing')).toBe(true);
  });

  it('treats a brand new markdown file as prose', () => {
    expect(yes('docs/NOTES.md', null, '# Notes')).toBe(true);
  });
});

describe('what needs a human', () => {
  it('refuses a renamed identifier', () => {
    expect(
      yes('src/lib/thing.ts', 'const total = 1;', 'const count = 1;'),
    ).toBe(false);
  });

  it('refuses a changed number', () => {
    // The difference between a 5MB cap and a 500MB one is not a word.
    expect(
      yes('src/lib/thing.ts', 'const MAX = 5;', 'const MAX = 500;'),
    ).toBe(false);
  });

  it('refuses an inverted condition', () => {
    expect(
      yes(
        'src/lib/thing.ts',
        'if (user.isHost) { allow(); }',
        'if (!user.isHost) { allow(); }',
      ),
    ).toBe(false);
  });

  it('refuses an added call', () => {
    expect(
      yes('src/lib/thing.ts', 'const a = 1;', 'const a = 1;\ndrop();'),
    ).toBe(false);
  });

  it('refuses a removed await', () => {
    expect(
      yes(
        'src/lib/thing.ts',
        'const ok = await checkRateLimit(k, 5, 60);',
        'const ok = checkRateLimit(k, 5, 60);',
      ),
    ).toBe(false);
  });

  it('refuses a deletion', () => {
    expect(yes('src/lib/thing.ts', 'const a = 1;', null)).toBe(false);
  });

  it('refuses a brand new code file', () => {
    expect(yes('src/lib/new-thing.ts', null, 'export const a = 1;')).toBe(false);
  });

  it('refuses a file type it cannot read', () => {
    expect(yes('src/app/globals.css', '.a { color: red }', '.a { color: blue }')).toBe(false);
  });

  it('refuses a changeset where any one file is code', () => {
    const verdict = copyOnlyChangeset([
      { path: 'docs/A.md', before: 'a', after: 'b' },
      { path: 'src/lib/thing.ts', before: 'const a = 1;', after: 'const a = 2;' },
    ]);
    expect(verdict.copyOnly).toBe(false);
    expect(verdict.reason).toContain('src/lib/thing.ts');
  });

  it('refuses an empty changeset rather than calling it safe', () => {
    expect(copyOnlyChangeset([]).copyOnly).toBe(false);
  });
});

/**
 * The reason this guard is not just a token comparison.
 *
 * Feedback arrives from anyone holding the checklist link, and the job reads it
 * as a work item. "The sign-in button should point at <somewhere>" is a
 * sentence a stranger can type into the box, and a tokenizer cannot tell an
 * href from a headline. So a literal that looks like a destination stops the
 * auto-merge on either side of the change.
 */
describe('a string that is a destination, not a sentence', () => {
  it('refuses a changed href', () => {
    expect(
      yes(
        'src/components/Nav.tsx',
        'export const N = () => <a href="/plans">Plans</a>;',
        'export const N = () => <a href="https://example.com/plans">Plans</a>;',
      ),
    ).toBe(false);
  });

  it('refuses an internal path becoming a different internal path', () => {
    expect(
      yes(
        'src/components/Nav.tsx',
        'const next = "/plans";',
        'const next = "/settings";',
      ),
    ).toBe(false);
  });

  it('refuses a javascript: URL', () => {
    expect(literalChangeIsSafe('Read more', 'javascript:alert(1)')).toBe(false);
  });

  it('refuses a bare domain appearing in copy', () => {
    expect(literalChangeIsSafe('Ask the host', 'Go to totally-legit.com')).toBe(false);
  });

  it('refuses markup smuggled into a literal', () => {
    expect(literalChangeIsSafe('Welcome', '<img src=x onerror=1>')).toBe(false);
  });

  it('still allows an ordinary sentence that merely contains a dot', () => {
    expect(literalChangeIsSafe('Plans you host.', 'Plans you are hosting.')).toBe(true);
  });
});

/**
 * A key is not copy either. This is the bug that shipped on this very page:
 * renaming the checklist's localStorage key emptied the list for the one
 * person part-way through it, and nothing anywhere reported an error.
 */
describe('a string that is a machine key, not a sentence', () => {
  it('refuses a renamed storage key', () => {
    expect(literalChangeIsSafe('swb-scope-v4', 'swb-scope-v5')).toBe(false);
  });

  it('refuses a renamed data attribute', () => {
    expect(literalChangeIsSafe('data-id', 'data-item')).toBe(false);
  });

  it('refuses a changed status slug', () => {
    expect(literalChangeIsSafe('needs_you', 'needs_them')).toBe(false);
  });

  it('refuses a renamed CSS class hook', () => {
    expect(literalChangeIsSafe('item-report', 'item-flag')).toBe(false);
  });

  it('refuses a changed SCREAMING_CASE constant value', () => {
    expect(literalChangeIsSafe('EXPECTED_SCHEMA', 'CURRENT_SCHEMA')).toBe(false);
  });

  it('still allows a one-word button label', () => {
    expect(literalChangeIsSafe('Save', 'Send')).toBe(true);
  });

  it('still allows ordinary sentences', () => {
    expect(literalChangeIsSafe('Down to hang', 'Down to hang out')).toBe(true);
  });
});

/**
 * Files where a string literal IS the behaviour. The token comparison would
 * wave these through, so they are refused by path before it ever runs.
 */
describe('protected paths', () => {
  it.each([
    ['src/proxy.ts', 'a route that skips authentication'],
    ['src/lib/csp.ts', 'a Content-Security-Policy directive'],
    ['src/lib/security.ts', 'an output encoder'],
    ['src/lib/supabase/database.types.ts', 'the database schema'],
    ['supabase/migrations/20260916120000_client_feedback.sql', 'a migration'],
    ['src/app/api/scope-feedback/route.ts', 'a route handler'],
    ['.github/workflows/ci.yml', 'the pipeline'],
    ['scripts/copy-only-check.mjs', 'the runner'],
    ['package.json', 'the dependency set'],
    ['src/lib/copy-only.ts', 'this guard itself'],
  ])('refuses %s (%s)', (path) => {
    expect(isProtectedPath(path)).toBe(true);
    expect(yes(path, 'const a = "x";', 'const a = "y";')).toBe(false);
  });

  it('refuses any SQL, lockfile or CI config wherever it lives', () => {
    expect(isProtectedPath('anywhere/thing.sql')).toBe(true);
    expect(isProtectedPath('a/b/pnpm-lock.yaml')).toBe(true);
    expect(isProtectedPath('.env.local')).toBe(true);
    expect(isProtectedPath('supabase/config.toml')).toBe(true);
  });

  it('says which path stopped it', () => {
    expect(why('src/proxy.ts', 'a', 'b')).toContain('src/proxy.ts');
  });
});

/**
 * The checklist page is a single HTML file whose entire list is one inline
 * script, so without this the typo fix the client actually asked for could
 * never qualify. The script is tokenized like any other JavaScript; the markup
 * around it must not move at all.
 */
describe('the checklist page, which is markup wrapped around one big script', () => {
  const page = (title: string, item: string) =>
    `<html><body><h1>${title}</h1><script>\nvar GROUPS = [{ id: "A", name: "${item}" }];\n</script></body></html>`;

  it('lets a typo inside the script’s data through', () => {
    expect(
      yes(
        'docs/scope-of-work-verification.html',
        page('Verification', 'Geek festival'),
        page('Verification', 'Greek festival'),
      ),
    ).toBe(true);
  });

  it('lets visible markup text through', () => {
    expect(
      yes(
        'docs/scope-of-work-verification.html',
        page('Verification', 'Greek festival'),
        page('Scope of Work Verification', 'Greek festival'),
      ),
    ).toBe(true);
  });

  it('refuses a new element', () => {
    expect(
      yes(
        'docs/scope-of-work-verification.html',
        '<div><p>a</p></div>',
        '<div><p>a</p><iframe></iframe></div>',
      ),
    ).toBe(false);
  });

  it('refuses a new attribute', () => {
    expect(
      yes(
        'docs/scope-of-work-verification.html',
        '<div><button>Go</button></div>',
        '<div><button onclick="steal()">Go</button></div>',
      ),
    ).toBe(false);
  });

  it('refuses a second script block', () => {
    expect(
      yes(
        'docs/scope-of-work-verification.html',
        '<body><script>var a = 1;</script></body>',
        '<body><script>var a = 1;</script><script>evil();</script></body>',
      ),
    ).toBe(false);
  });

  it('refuses changed logic inside the script', () => {
    expect(
      yes(
        'docs/scope-of-work-verification.html',
        '<body><script>if (ok) { go(); }</script></body>',
        '<body><script>if (!ok) { go(); }</script></body>',
      ),
    ).toBe(false);
  });

  it('refuses a URL appearing in visible page text', () => {
    expect(
      yes(
        'docs/scope-of-work-verification.html',
        '<p>Ask your host for the link</p>',
        '<p>Go to https://not-switchboard.example to sign in</p>',
      ),
    ).toBe(false);
  });
});
