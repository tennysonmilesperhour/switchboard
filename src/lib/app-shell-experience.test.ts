import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('route loading coverage', () => {
  const routes = [
    'settings',
    'you',
    'zones',
    'map',
    'features',
    'u/[handle]',
    'create',
    'events/new',
    'profile/edit',
  ];

  test.each(routes)('%s renders the shared route skeleton', (route) => {
    const file = join(ROOT, 'src/app', route, 'loading.tsx');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('PageSkeleton');
  });
});

describe('offline and overlay shell', () => {
  test('navigation failures use a dedicated precached offline page', () => {
    const worker = read('public/sw.js');
    expect(worker).toContain("'/offline.html'");
    expect(worker).not.toContain("caches.match('/welcome')");
    expect(read('public/offline.html')).toContain('You’re offline');
    expect(read('src/proxy.ts')).toContain('manifest.webmanifest|offline.html|sw.js');
  });

  test('every former modal surface imports the shared primitive', () => {
    const surfaces = [
      'src/components/ui/ConfirmDialog.tsx',
      'src/components/shell/BottomNav.tsx',
      'src/components/events/InviteeSheet.tsx',
      'src/app/profile/ProfileShare.tsx',
      'src/components/events/PlaceSearchInput.tsx',
    ];
    for (const surface of surfaces) {
      expect(read(surface), surface).toContain("@/components/ui/Dialog");
    }
  });

  test('the optional notification gate cannot replace the shell with an error', () => {
    const gate = read('src/components/shell/InviteAwareNotificationNudge.tsx');
    expect(gate).toMatch(/try \{[\s\S]*?getRenderUser\(\)/);
    expect(gate).toMatch(/catch \{[\s\S]*?return null;/);
  });

  test('an unsaved dark preference uses Dusk and emits media-aware chrome colors', () => {
    const css = read('src/app/globals.css');
    const darkSystem = css.match(
      /@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme\]\) \{([\s\S]*?)\n  \}/,
    );
    expect(darkSystem?.[1]).toContain('color-scheme: dark');

    // The system-dark block must be Dusk, declaration for declaration. #176
    // hand-copied it from an older Dusk and silently undid the AA contrast
    // work #167 had just done on the accent tokens; comparing against the
    // Dusk block itself means a Dusk change can never leave this behind.
    const dusk = css.match(/\[data-theme="dusk"\] \{\n([\s\S]*?)\n\}/);
    const declarations = (block: string | undefined) =>
      (block ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('--'))
        .sort();
    expect(declarations(darkSystem?.[1])).toEqual(declarations(dusk?.[1]));
    expect(declarations(dusk?.[1]).length).toBeGreaterThan(20);

    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('export async function generateViewport()');
    expect(layout).toContain("media: '(prefers-color-scheme: dark)'" );
    expect(layout).toContain("shell.themeVars['--color-paper']");
  });
});
