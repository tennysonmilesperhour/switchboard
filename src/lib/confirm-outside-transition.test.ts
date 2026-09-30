import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The app's confirm and prompt dialogs must be asked before a transition
 * starts, never inside one.
 *
 * `useConfirm()` opens its dialog with a state update. Inside
 * `startTransition(async () => …)` that update belongs to the transition, and
 * React holds a transition's updates until the whole async action settles —
 * which it never does, because the action is awaiting the dialog's answer. The
 * button shows its busy state and no dialog ever appears.
 *
 * Eight controls shipped like that ("Leave zone", "Leave this board", "Delete
 * this board", deleting a zone, removing a zone member, withdrawing a venue
 * claim, removing someone from the invitation line, replacing the invite
 * link). None could ever be completed, and nothing but a person pressing them
 * — or e2e/places.spec.ts — could tell. This reads the source so the pattern
 * cannot come back.
 */

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(path);
  }
  return files;
}

/** The body of every `startTransition(async … => { … })` in a file. */
function asyncTransitionBodies(source: string): Array<{ line: number; body: string }> {
  const bodies: Array<{ line: number; body: string }> = [];
  const opener = /startTransition\(\s*async\s*\([^)]*\)\s*=>\s*\{/g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      index += 1;
    }
    bodies.push({
      line: source.slice(0, match.index).split('\n').length,
      body: source.slice(match.index + match[0].length, index),
    });
  }
  return bodies;
}

/** Any awaited app dialog inside those bodies, by name. */
function dialogsAwaitedInTransitions(source: string): Array<{ line: number; dialog: string }> {
  return asyncTransitionBodies(source).flatMap(({ line, body }) =>
    [...body.matchAll(/await\s+(confirm|prompt)\s*\(/g)].map((hit) => ({ line, dialog: hit[1] })),
  );
}

describe('dialogsAwaitedInTransitions', () => {
  it('finds a confirm awaited inside an async transition', () => {
    const source = [
      'function leave() {',
      '  startTransition(async () => {',
      '    const ok = await confirm({ title: "Leave?" });',
      '    if (!ok) return;',
      '    await leaveZone(id);',
      '  });',
      '}',
    ].join('\n');
    expect(dialogsAwaitedInTransitions(source)).toEqual([{ line: 2, dialog: 'confirm' }]);
  });

  it('accepts a confirm asked before the transition starts', () => {
    const source = [
      'async function leave() {',
      '  const ok = await confirm({ title: "Leave?" });',
      '  if (!ok) return;',
      '  startTransition(async () => {',
      '    await leaveZone(id);',
      '  });',
      '}',
    ].join('\n');
    expect(dialogsAwaitedInTransitions(source)).toEqual([]);
  });

  it('sees a prompt nested deeper in the action', () => {
    const source = [
      'startTransition(async () => {',
      '  if (ready) {',
      '    const text = await prompt({ title: "Why?" });',
      '  }',
      '});',
    ].join('\n');
    expect(dialogsAwaitedInTransitions(source)).toEqual([{ line: 1, dialog: 'prompt' }]);
  });
});

describe('the app never awaits a dialog inside a transition', () => {
  it('holds for every component and page', () => {
    const offenders = sourceFiles(ROOT).flatMap((path) =>
      dialogsAwaitedInTransitions(readFileSync(path, 'utf8')).map(
        ({ line, dialog }) => `${relative(join(ROOT, '..'), path)}:${line} awaits ${dialog}() inside startTransition`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
