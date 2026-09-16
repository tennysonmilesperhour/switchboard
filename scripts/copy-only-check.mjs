#!/usr/bin/env node
/**
 * Decide whether the working branch is safe for the client-feedback job to
 * merge without a human.
 *
 * Usage:  node scripts/copy-only-check.mjs [base-ref]     (default origin/main)
 *
 * Exit 0  every changed file is words only — auto-merge is permitted
 * Exit 1  something is code — open a pull request and stop
 * Exit 2  the check could not run (bad ref, git failure). Treated as exit 1 by
 *         the runbook: an answer we could not compute is never a yes.
 *
 * The decision itself lives in src/lib/copy-only.ts, where it is unit-tested.
 * This file only feeds it the diff.
 */
import { execFileSync } from 'node:child_process';

// Node 22 strips TypeScript types on import, so the tested module is imported
// directly rather than kept as a second, drifting copy in plain JS.
const { copyOnlyChangeset } = await import('../src/lib/copy-only.ts');

const base = process.argv[2] ?? 'origin/main';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function contentAt(ref, path) {
  try {
    return git(['show', `${ref}:${path}`]);
  } catch {
    return null;
  }
}

async function main() {
  let mergeBase;
  try {
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
  } catch (error) {
    console.error(`Could not find a merge base with ${base}: ${error.message}`);
    process.exit(2);
  }

  const names = git(['diff', '--name-only', `${mergeBase}..HEAD`])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const files = names.map((path) => ({
    path,
    before: contentAt(mergeBase, path),
    after: contentAt('HEAD', path),
  }));

  const verdict = copyOnlyChangeset(files);

  console.log(`base:  ${base} (${mergeBase.slice(0, 8)})`);
  console.log(`files: ${names.length === 0 ? '(none)' : names.join(', ')}`);
  if (verdict.copyOnly) {
    console.log('verdict: COPY-ONLY — words changed, behaviour did not. Auto-merge permitted.');
    process.exit(0);
  }
  console.log(`verdict: NEEDS A HUMAN — ${verdict.reason}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`copy-only check failed to run: ${error.stack ?? error}`);
  process.exit(2);
});
