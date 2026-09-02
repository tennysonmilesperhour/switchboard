import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, files);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function lines(path: string): number {
  return readFileSync(path, 'utf8').trimEnd().split(/\r?\n/).length;
}

const allSource = sourceFiles(SRC);

describe('source architecture boundaries', () => {
  it('keeps source files at or below 800 lines except explicit registries', () => {
    // Registries: the theme catalogue and the error-code registry (`SB-*` codes
    // are permanent and only ever grow — see AGENTS.md).
    const registryAllowlist = new Set(['lib/theme-custom.ts', 'lib/errors.ts']);
    const oversized = allSource
      .map((path) => ({ path: relative(SRC, path), lines: lines(path) }))
      .filter(({ path, lines: count }) => count > 800 && !registryAllowlist.has(path));

    expect(oversized).toEqual([]);
  });

  it('keeps the event, wizard, and people splits present', () => {
    const required = [
      'lib/actions/events-lifecycle.ts',
      'lib/actions/event-invitees.ts',
      'lib/actions/event-cohosts.ts',
      'lib/actions/event-share-links.ts',
      'lib/server/event-page.ts',
      'lib/server/settings-page.ts',
      'app/events/new/steps/BasicsStep.tsx',
      'app/events/new/steps/StyleStep.tsx',
      'app/events/new/steps/PeopleStep.tsx',
      'app/events/new/steps/OrderStep.tsx',
      'app/events/new/steps/VisibilityStep.tsx',
      'app/events/new/steps/ReviewStep.tsx',
      'app/people/sections/AddSomeoneSection.tsx',
      'app/people/sections/IncomingRequestsSection.tsx',
      'app/people/sections/FriendsSection.tsx',
      'app/people/sections/OutgoingRequestsSection.tsx',
      'app/people/sections/HouseholdsSection.tsx',
      'app/people/sections/MatchmakerSection.tsx',
      'app/people/sections/CirclesSection.tsx',
    ];

    expect(required.filter((path) => !existsSync(join(SRC, path)))).toEqual([]);
  });

  it('keeps sensitive modules server-only', () => {
    const sensitive = [
      'lib/supabase/admin.ts',
      'lib/ai/claude.ts',
      'lib/server/email.ts',
      'lib/server/sms.ts',
      'lib/server/notify.ts',
      'lib/server/secret.ts',
    ];

    const missingBoundary = sensitive.filter(
      (path) => !readFileSync(join(SRC, path), 'utf8').startsWith("import 'server-only';"),
    );
    expect(missingBoundary).toEqual([]);
  });

  it('does not import the service-role client into components or Client modules', () => {
    const offenders = allSource
      .filter(
        (path) =>
          path.includes(`${join('src', 'components')}/`) || /Client\.(?:ts|tsx)$/.test(basename(path)),
      )
      .filter((path) => readFileSync(path, 'utf8').includes('@/lib/supabase/admin'))
      .map((path) => relative(SRC, path));

    expect(offenders).toEqual([]);
  });

  it('authorizes every event action before creating a service-role client', () => {
    const actionFiles = [
      'lib/actions/events-lifecycle.ts',
      'lib/actions/event-invitees.ts',
      'lib/actions/event-cohosts.ts',
      'lib/actions/event-share-links.ts',
    ];
    const unguarded: string[] = [];

    for (const path of actionFiles) {
      const source = readFileSync(join(SRC, path), 'utf8');
      for (const match of source.matchAll(/\bcreateAdminClient\(\)/g)) {
        const prefix = source.slice(0, match.index);
        const functionStart = prefix.lastIndexOf('function ');
        const functionPrefix = prefix.slice(functionStart);
        if (!functionPrefix.includes('checkEventManager(')) {
          unguarded.push(`${path}:${prefix.split(/\r?\n/).length}`);
        }
      }
    }

    expect(unguarded).toEqual([]);
  });

  it('loads the event page in two documented database phases', () => {
    const loader = readFileSync(join(SRC, 'lib/server/event-page.ts'), 'utf8');
    const phaseOne = loader.indexOf('// Phase one:');
    const phaseTwo = loader.indexOf('// Phase two:');

    expect(phaseOne).toBeGreaterThan(-1);
    expect(phaseTwo).toBeGreaterThan(phaseOne);
    expect(loader.slice(phaseOne, phaseTwo)).toContain('await Promise.all([');
    expect(loader.slice(phaseTwo)).toContain('await Promise.all([');
  });
});
