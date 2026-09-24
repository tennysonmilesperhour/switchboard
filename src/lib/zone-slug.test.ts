import { describe, expect, it } from 'vitest';
import { zoneSlugBase, zoneSlugCandidate } from './zone-slug';

describe('zoneSlugBase', () => {
  it('makes a readable address from a Latin name', () => {
    expect(zoneSlugBase('Denver Comic Con 2026')).toBe('denver-comic-con-2026');
  });

  it('keeps accented letters as their base letter', () => {
    expect(zoneSlugBase('Café Luna')).toBe('cafe-luna');
  });

  /** Used to slug to nothing and be refused as "shorter than 3 letters". */
  it('falls back when a name has no Latin letters', () => {
    expect(zoneSlugBase('東京')).toBe('zone');
    expect(zoneSlugBase('Кафе')).toBe('zone');
  });

  it('never ends on a dash after trimming to length', () => {
    const slug = zoneSlugBase(`${'a'.repeat(39)} b`);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});

describe('zoneSlugCandidate', () => {
  it('tries the bare name first, then varies it', () => {
    expect(zoneSlugCandidate('book-club', 0)).toBe('book-club');
    expect(zoneSlugCandidate('book-club', 1, () => 0.5)).toMatch(/^book-club-[0-9a-z]{4}$/);
  });

  it('stays inside the 40-character column check with a suffix', () => {
    const long = zoneSlugBase('a'.repeat(60));
    expect(zoneSlugCandidate(long, 2, () => 0.9)).toMatch(/^[a-z0-9-]{3,40}$/);
  });

  it('always varies the fallback, so two unnamed zones never collide on "zone"', () => {
    expect(zoneSlugCandidate('zone', 0, () => 0.25)).toMatch(/^zone-[0-9a-z]{4}$/);
  });
});
