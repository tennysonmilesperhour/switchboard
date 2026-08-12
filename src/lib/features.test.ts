import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  FEATURE_GROUPS,
  featureMatches,
  filterFeatureGroups,
} from './features';

/**
 * The feature index is a promise: "here is everything, and here is where it
 * is." A promise like that decays silently — a page gets renamed, a tab moves,
 * a new surface ships — and the index becomes a list of dead ends that is worse
 * than having none.
 *
 * So the contract is enforced by reading the app rather than asserted:
 *
 * 1. every `href` resolves to a route that actually exists in `src/app`;
 * 2. every destination the bottom nav offers appears in the index, so the index
 *    can never know less than the navigation it's meant to explain;
 * 3. every top-level page in the app is either indexed or listed below with a
 *    reason, so a new feature surface can't ship unlisted by accident.
 */

const APP_DIR = join(process.cwd(), 'src', 'app');

/** Mirrors Next's own resolution: exact segment, dynamic `[…]`, route groups. */
function resolveRoute(dir: string, segments: string[]): boolean {
  if (segments.length === 0) {
    return ['page.tsx', 'page.ts', 'route.ts'].some((file) =>
      existsSync(join(dir, file)),
    );
  }
  const [head, ...rest] = segments;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // A route group `(name)` contributes nothing to the URL — look straight
    // through it at the same segment.
    if (entry.name.startsWith('(')) {
      if (resolveRoute(join(dir, entry.name), segments)) return true;
      continue;
    }
    const dynamic = /^\[.+\]$/.test(entry.name);
    if ((entry.name === head || dynamic) && resolveRoute(join(dir, entry.name), rest)) {
      return true;
    }
  }
  return false;
}

function routeExists(href: string): boolean {
  const pathname = href.split(/[?#]/)[0];
  return resolveRoute(APP_DIR, pathname.split('/').filter(Boolean));
}

/**
 * Routes that deliberately have no index entry, each with the reason. Adding a
 * page means either indexing it or admitting here why a user browsing the index
 * shouldn't be sent to it.
 */
const NOT_INDEXED: Record<string, string> = {
  features: 'the index itself',
  welcome: 'signed-out landing page',
  login: 'auth',
  'forgot-password': 'auth',
  'reset-password': 'auth',
  onboarding: 'auth — reached automatically on first run',
  'verify-contact': 'reached from a verification link, not browsed to',
  'legal-update': 'interstitial shown when the terms change',
  i: 'per-plan share link; you arrive with a token, you don’t browse here',
  join: 'shareable plan link; token-addressed',
  rsvp: 'guest RSVP link; token-addressed',
  approve: 'guardian approval link; token-addressed',
  u: 'someone else’s public profile; reached by handle',
  terms: 'covered by the “Privacy, terms, and copyright” entry',
  copyright: 'covered by the “Privacy, terms, and copyright” entry',
  moderation: 'operator screen, gated to appointed moderators',
  design: 'internal design-system reference, 404s in production',
  'scope-verification': 'client-facing verification checklist, URL-only access',
  api: 'not a page',
  auth: 'not a page',
};

describe('the catalogue', () => {
  it('gives every feature a unique id, a blurb, and directions', () => {
    const ids = new Set<string>();
    for (const feature of FEATURES) {
      expect(feature.id, `${feature.title} needs a slug id`).toMatch(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
      );
      expect(ids.has(feature.id), `duplicate id: ${feature.id}`).toBe(false);
      ids.add(feature.id);
      expect(feature.title.length, `${feature.id} needs a title`).toBeGreaterThan(0);
      expect(feature.blurb.length, `${feature.id} needs a blurb`).toBeGreaterThan(20);
      expect(feature.where.length, `${feature.id} needs directions`).toBeGreaterThan(0);
    }
  });

  it('keeps group ids unique and no group empty', () => {
    const ids = FEATURE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of FEATURE_GROUPS) {
      expect(group.features.length, `${group.id} is empty`).toBeGreaterThan(0);
    }
  });

  it('never lists the same feature twice under different names', () => {
    const titles = FEATURES.map((feature) => feature.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('every link goes somewhere real', () => {
  const linked = FEATURES.filter((feature) => feature.href);

  it('links only to internal routes, never an unfilled dynamic path', () => {
    for (const feature of linked) {
      expect(feature.href, `${feature.id} must link inside the app`).toMatch(/^\//);
      // `/events/[id]` in the catalogue would render as a literal dead link;
      // features reached through a specific plan or room carry directions only.
      expect(feature.href, `${feature.id} links to an unfilled path`).not.toContain('[');
    }
  });

  it('resolves each href against src/app', () => {
    for (const feature of linked) {
      expect(routeExists(feature.href!), `${feature.id} → ${feature.href}`).toBe(true);
    }
  });
});

describe('coverage', () => {
  const indexed = new Set(
    FEATURES.flatMap((feature) =>
      feature.href ? [feature.href.split(/[?#]/)[0]] : [],
    ),
  );

  it('covers every destination the bottom nav offers', () => {
    const nav = readFileSync(
      join(process.cwd(), 'src', 'components', 'shell', 'BottomNav.tsx'),
      'utf8',
    );
    const hrefs = [...nav.matchAll(/href[:=]\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      if (href === '/features') continue; // the index doesn't index itself
      expect(indexed.has(href), `${href} is in the nav but not in the index`).toBe(
        true,
      );
    }
  });

  it('accounts for every top-level page in the app', () => {
    const topLevel = readdirSync(APP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('('))
      .map((entry) => entry.name)
      .filter((name) => hasPageSomewhere(join(APP_DIR, name)));

    for (const name of topLevel) {
      if (NOT_INDEXED[name]) continue;
      const covered = [...indexed].some(
        (href) => href === `/${name}` || href.startsWith(`/${name}/`),
      );
      expect(
        covered,
        `/${name} has no feature-index entry — add one, or add a reason to NOT_INDEXED`,
      ).toBe(true);
    }
  });
});

function hasPageSomewhere(dir: string): boolean {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (hasPageSomewhere(path)) return true;
    } else if (entry === 'page.tsx') {
      return true;
    }
  }
  return false;
}

describe('search', () => {
  const group = FEATURE_GROUPS[0];

  it('returns everything for an empty query', () => {
    expect(filterFeatureGroups('')).toHaveLength(FEATURE_GROUPS.length);
    expect(filterFeatureGroups('   ')).toHaveLength(FEATURE_GROUPS.length);
  });

  it('finds a feature by what it does, not just its name', () => {
    const hits = filterFeatureGroups('who owes what').flatMap((g) => g.features);
    expect(hits.map((feature) => feature.id)).toContain('split-the-bill');
  });

  it('finds a feature by where it lives', () => {
    const hits = filterFeatureGroups('quiet hours').flatMap((g) => g.features);
    expect(hits.map((feature) => feature.id)).toContain('quiet-hours');
  });

  it('narrows as terms are added rather than widening', () => {
    const broad = filterFeatureGroups('invite').flatMap((g) => g.features).length;
    const narrow = filterFeatureGroups('invite link').flatMap((g) => g.features).length;
    expect(narrow).toBeLessThan(broad);
  });

  it('ignores case', () => {
    expect(featureMatches(group.features[0], group, 'START SOMETHING')).toBe(
      featureMatches(group.features[0], group, 'start something'),
    );
  });

  it('drops groups with no matches instead of showing empty headings', () => {
    const groups = filterFeatureGroups('zzzznothing');
    expect(groups).toHaveLength(0);
  });
});
