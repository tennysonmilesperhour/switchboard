import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/**
 * Public pages a crawler is invited to (sitemap.ts), other than `/`, which is
 * the signed-in home. Each one names its own canonical path; the root layout's
 * metadataBase turns that into https://switchboardsocial.me/<path>.
 */
const PUBLIC_CANONICALS = [
  ['src/app/welcome/page.tsx', '/welcome'],
  ['src/app/login/page.tsx', '/login'],
  ['src/app/privacy/page.tsx', '/privacy'],
  ['src/app/terms/page.tsx', '/terms'],
  ['src/app/sms-compliance/page.tsx', '/sms-compliance'],
  ['src/app/community/page.tsx', '/community'],
  ['src/app/copyright/page.tsx', '/copyright'],
] as const;

describe('public canonicals', () => {
  test.each(PUBLIC_CANONICALS)('%s canonicalises %s', (file, path) => {
    expect(read(file)).toContain(`canonical: '${path}'`);
    expect(read('src/app/sitemap.ts')).toContain(`'${path}'`);
  });

  test('the root layout resolves those paths against the app origin', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('metadataBase');
    expect(layout).toContain('appOriginOrUndefined()');
  });

  test('per-user app routes do not publish a canonical', () => {
    expect(read('src/app/page.tsx')).not.toContain('canonical:');
    expect(read('src/app/settings/page.tsx')).not.toContain('canonical:');
    expect(read('src/app/events/[id]/page.tsx')).not.toContain('canonical:');
  });
});

describe('marketing page', () => {
  test('credits Tennyson Taggart from the footer', () => {
    const page = read('src/app/welcome/page.tsx');
    expect(page).toContain('href="https://tennysontaggart.com"');
    expect(page).toContain('by Tennyson Taggart');
  });
});
