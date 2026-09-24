import { describe, expect, it } from 'vitest';
import { MAX_SLUG, slugBase, slugCandidate } from './url-slug';

const SLUG_CHECK = /^[a-z0-9-]{3,40}$/;

describe('slugBase', () => {
  it('folds accents and joins words', () => {
    expect(slugBase('Café  Society', 'board')).toBe('cafe-society');
  });

  it('falls back when nothing Latin is left', () => {
    expect(slugBase('東京の友達', 'board')).toBe('board');
    expect(slugBase('!!', 'board')).toBe('board');
  });

  it('stays within the database check', () => {
    const slug = slugBase('a very long neighborhood board name that keeps on going', 'board');
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG);
    expect(slug).toMatch(SLUG_CHECK);
  });
});

describe('slugCandidate', () => {
  it('tries the plain name first', () => {
    expect(slugCandidate('maple-street', 0, 'board')).toBe('maple-street');
  });

  it('adds a suffix on a retry and stays valid', () => {
    const long = slugBase('x'.repeat(60), 'board');
    const slug = slugCandidate(long, 1, 'board', () => 0.5);
    expect(slug).toMatch(SLUG_CHECK);
    expect(slug).not.toBe(long);
  });

  it('never uses the bare fallback word', () => {
    expect(slugCandidate('board', 0, 'board', () => 0)).toBe('board-0000');
  });
});
