import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homePillars } from '@/components/home/PillarRow';
import { FEATURES } from './features';
import {
  mostRecentlyChosenCircle,
  resolveDefaultSignalCircle,
  resolveSignalAudience,
} from './signal-audience';

describe('Home density gate', () => {
  it('shows exactly the three useful pillars to a new user', () => {
    expect(
      homePillars({ hasConnections: false, showAround: false }).map(
        (pillar) => pillar.title,
      ),
    ).toEqual(['Make a plan', 'People', 'Plans']);
  });

  it('adds social pillars only after a connection exists', () => {
    const titles = homePillars({ hasConnections: true, showAround: false }).map(
      (pillar) => pillar.title,
    );
    expect(titles).toContain('Mutual');
    expect(titles).toContain('I’m free');
    expect(titles).not.toContain('Around');
  });

  it('adds Around only when local density exists', () => {
    expect(
      homePillars({ hasConnections: false, showAround: true }).map(
        (pillar) => pillar.title,
      ),
    ).toEqual(['Make a plan', 'People', 'Plans', 'Around']);
  });

  it('has no separate Moments or Zones shortcut around the gate', () => {
    const home = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8');
    expect(home).not.toMatch(/href[:=]\s*['"]\/(?:moments|zones)['"]/);
  });
});

describe('Around navigation', () => {
  const bottomNav = readFileSync(
    join(process.cwd(), 'src/components/shell/BottomNav.tsx'),
    'utf8',
  );
  const moreItems = bottomNav.slice(
    bottomNav.indexOf('const MORE:'),
    bottomNav.indexOf('const MORE_HREFS'),
  );
  const tabs = readFileSync(
    join(process.cwd(), 'src/components/around/AroundTabs.tsx'),
    'utf8',
  );

  it('offers one grouped entry instead of three empty-room entries', () => {
    expect(moreItems.match(/label: 'Around'/g)).toHaveLength(1);
    expect(moreItems).not.toMatch(/label: '(?:Map|Zones|Moments)'/);
    expect(moreItems).toContain("activeHrefs: ['/map', '/zones', '/moments']");
  });

  it('keeps Map, Zones, and Moments one tap away inside Around', () => {
    for (const href of ['/map', '/zones', '/moments']) {
      expect(tabs).toContain(`href: '${href}'`);
    }
  });

  it('teaches the grouped path everywhere in the feature index', () => {
    for (const id of ['moments', 'zones', 'private-zones', 'map', 'live-location']) {
      expect(FEATURES.find((feature) => feature.id === id)?.where).toContain('Around');
    }
  });
});

describe('circle-scoped signal default', () => {
  const circles = ['close', 'neighbors'];

  it('uses the remembered owned circle, then the first circle', () => {
    expect(resolveDefaultSignalCircle(circles, 'neighbors')).toBe('neighbors');
    expect(resolveDefaultSignalCircle(circles, 'deleted')).toBe('close');
  });

  it('has no audience only when there are no circles', () => {
    expect(resolveDefaultSignalCircle([], null)).toBeNull();
    expect(resolveSignalAudience(null, null)).toEqual([]);
  });

  it('does not replace an active explicit Everyone choice with the default', () => {
    expect(resolveSignalAudience([], 'close')).toEqual([]);
  });

  it('remembers the circle most recently added to the audience', () => {
    expect(mostRecentlyChosenCircle(['close'], ['close', 'neighbors'])).toBe(
      'neighbors',
    );
    expect(mostRecentlyChosenCircle(['close'], [])).toBeNull();
  });
});
