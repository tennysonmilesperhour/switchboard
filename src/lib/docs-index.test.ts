import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCS_DIR = join(process.cwd(), 'docs');
const INDEX_PATH = join(DOCS_DIR, 'README.md');

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe('the docs index', () => {
  const index = readFileSync(INDEX_PATH, 'utf8');

  it('links every file in docs', () => {
    for (const path of filesUnder(DOCS_DIR)) {
      const fromDocs = relative(DOCS_DIR, path);
      expect(index, `${fromDocs} is missing from docs/README.md`).toContain(
        `](${fromDocs})`,
      );
    }
  });

  it('has no broken local file links', () => {
    const destinations = [...index.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)].map(
      ([, destination]) => destination,
    );

    for (const destination of destinations) {
      if (/^[a-z]+:/i.test(destination)) continue;
      expect(
        existsSync(resolve(DOCS_DIR, destination)),
        `docs/README.md links to missing ${destination}`,
      ).toBe(true);
    }
  });
});
