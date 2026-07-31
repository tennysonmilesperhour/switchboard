import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  MAPPED_ERROR_AREAS,
  codeForArea,
  errorFor,
  errorRef,
  failure,
  type ErrorCode,
} from './errors';
import { shareLinkCode, type ShareLinkState } from './share-link';

/**
 * The error-code contract.
 *
 * A code is only worth anything if it is (a) present wherever a human sees a
 * failure, (b) the same on the screen and in the log, and (c) stable enough
 * that an old screenshot still means what it meant. These tests check all three,
 * and — most importantly — they check COVERAGE by reading the source, so
 * "every operational failure carries a code" is enforced rather than asserted.
 */

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) {
      out.push(path);
    }
  }
  return out;
}

const ALL_SOURCE = sourceFiles(SRC).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));

describe('the registry', () => {
  it('gives every code a message and an actor', () => {
    for (const code of ERROR_CODES) {
      const entry = errorFor(code);
      expect(entry.message, code).toBeTruthy();
      expect(['reader', 'host', 'operator'], code).toContain(entry.actor);
    }
  });

  it('uses the SB-AREA-REASON shape, so a code reads as itself in a screenshot', () => {
    // SB-UNKNOWN is the deliberate two-part exception: it names no area because
    // it is the fallback for a failure we failed to classify.
    for (const code of ERROR_CODES) {
      expect(code, code).toMatch(/^SB-[A-Z]+(-[A-Z]+)*$/);
      if (code !== 'SB-UNKNOWN') {
        expect(code.split('-').length, `${code} needs an area and a reason`).toBe(3);
      }
    }
  });

  it('has no duplicate codes', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('never tells someone to fix what they cannot reach', () => {
    // An operator-only failure with a "try again" is worse than no advice: it
    // sends the reader in circles over something no amount of retrying fixes.
    // Say nothing, and let the UI own it.
    for (const code of ERROR_CODES) {
      const entry = errorFor(code);
      if (entry.actor !== 'operator') continue;
      expect(entry.fix, `${code} tells an operator-blocked reader to act`).toBeNull();
    }
  });

  it('gives every reader-actionable failure an actual next step', () => {
    // The converse: if the reader CAN do something, the message has to say what.
    // "Could not save. Try again." with no code and no step is the shape this
    // whole system exists to retire.
    const noFix = ERROR_CODES.filter(
      (code) => errorFor(code).actor === 'reader' && errorFor(code).fix === null,
    );
    // Cancelled and past plans are the honest exceptions — there is nothing to
    // do, and inventing a step would be noise.
    expect(noFix.sort()).toEqual(
      ['SB-LINK-CANCELLED', 'SB-LINK-PAST', 'SB-PERM-DENIED'].sort(),
    );
  });
});

describe('coverage across the app', () => {
  /**
   * Every `reportOperationalError('area', …)` in the codebase must map to a
   * code. This is the check that makes the claim "the whole app" true: adding a
   * new logged failure without deciding what the user is told fails here.
   */
  it('maps every area string used anywhere in src/', () => {
    const used = new Set<string>();
    for (const { text } of ALL_SOURCE) {
      for (const match of text.matchAll(
        /reportOperationalError\(\s*'([a-z0-9.:_-]+)'/g,
      )) {
        used.add(match[1]);
      }
    }
    expect(used.size, 'no reportOperationalError calls found — regex is stale').toBeGreaterThan(
      20,
    );

    const unmapped = [...used].filter((area) => !MAPPED_ERROR_AREAS.includes(area));
    expect(unmapped, `unmapped error areas: ${unmapped.join(', ')}`).toEqual([]);
  });

  it('has no mappings for areas that no longer exist', () => {
    // A stale mapping is a code nobody will ever see, which quietly rots the
    // table until nobody trusts it.
    const source = ALL_SOURCE.map((f) => f.text).join('\n');
    const orphaned = MAPPED_ERROR_AREAS.filter(
      (area) => !source.includes(`'${area}'`),
    );
    expect(orphaned, `mapped areas with no call site: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('keeps global-error.tsx in step with the registry', () => {
    // That file cannot import anything (the root layout has already failed), so
    // its code is written out as a literal. This is what stops the literal and
    // the registry drifting apart.
    const globalError = ALL_SOURCE.find((f) => f.path.endsWith('global-error.tsx'));
    expect(globalError, 'global-error.tsx not found').toBeDefined();
    expect(globalError?.text).toContain('SB-LAYOUT-CRASH');
    expect(ERROR_CODES).toContain('SB-LAYOUT-CRASH' as ErrorCode);
  });

  it('passes the code through wherever a toast renders an action failure', () => {
    // A toast lasts five seconds and cannot be screenshotted at leisure, so the
    // code has to be in the same glance as the message. Any
    // `toast.error(result.error ?? '…')` that drops `result.code` is a failure
    // the user can see but not report.
    const dropped: string[] = [];
    for (const { path, text } of ALL_SOURCE) {
      for (const match of text.matchAll(
        /toast\.error\(\s*result\.error \?\? '[^']*'\s*(,[^)]*)?\)/g,
      )) {
        if (!match[1]?.includes('result.code')) {
          dropped.push(`${path.replace(process.cwd(), '')}: ${match[0].slice(0, 60)}`);
        }
      }
    }
    expect(dropped, `toast sites dropping the code:\n${dropped.join('\n')}`).toEqual([]);
  });

  it('shows the digest on both error boundaries', () => {
    // The digest is what ties a crash screenshot to a server log line. It was
    // being computed and thrown away.
    for (const name of ['app/error.tsx', 'app/global-error.tsx']) {
      const file = ALL_SOURCE.find((f) => f.path.endsWith(name));
      expect(file, `${name} not found`).toBeDefined();
      expect(file?.text, `${name} drops error.digest`).toContain('digest');
    }
  });
});

describe('every invite-link dead end names itself', () => {
  // The origin of all this: one sentence for four causes. Each state now maps to
  // a distinct registered code, so a screenshot IS the diagnosis.
  const STATES: ShareLinkState[] = [
    'missing',
    'off',
    'unpublished',
    'deciding',
    'cancelled',
    'past',
  ];

  it('assigns a distinct, registered code to each state', () => {
    const codes = STATES.map((state) => shareLinkCode(state));
    for (const code of codes) {
      expect(code).not.toBeNull();
      expect(ERROR_CODES).toContain(code as ErrorCode);
    }
    expect(new Set(codes).size, 'two link states share a code').toBe(STATES.length);
  });

  it('leaves a working link uncoded', () => {
    expect(shareLinkCode('live')).toBeNull();
  });
});

describe('failure() and errorRef()', () => {
  it('carries the code and the fix alongside the sentence', () => {
    const result = failure('SB-RSVP-SAVE');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('SB-RSVP-SAVE');
    expect(result.error).toBe(errorFor('SB-RSVP-SAVE').message);
    expect(result.fix).toBe(errorFor('SB-RSVP-SAVE').fix);
  });

  it('lets a call site override the sentence without dropping the diagnosis', () => {
    const result = failure('SB-RSVP-SAVE', 'The host closed this plan mid-answer.');
    expect(result.error).toBe('The host closed this plan mid-answer.');
    expect(result.code).toBe('SB-RSVP-SAVE');
    expect(result.fix).toBe(errorFor('SB-RSVP-SAVE').fix);
  });

  it('appends a digest when there is one', () => {
    expect(errorRef('SB-APP-CRASH')).toBe('SB-APP-CRASH');
    expect(errorRef('SB-APP-CRASH', 'abc123')).toBe('SB-APP-CRASH · abc123');
  });

  it('falls back rather than throwing on an unmapped area', () => {
    // A missing mapping must degrade to a vague code, never to a crash inside
    // the error path itself.
    expect(codeForArea('not-a-real-area')).toBe('SB-UNKNOWN');
  });
});
