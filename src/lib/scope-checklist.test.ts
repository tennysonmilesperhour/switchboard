import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isScopeItemId, SCOPE_ITEM_IDS } from './scope-checklist';

describe('scope checklist identity', () => {
  it('accepts exactly the items the client can review on the page', () => {
    const html = readFileSync('docs/scope-of-work-verification.html', 'utf8');
    const renderedIds = [...html.matchAll(/\bid:\s*"([A-Z]\d+)"/g)].map((match) => match[1]);
    expect(renderedIds).toEqual([...SCOPE_ITEM_IDS]);
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
  });

  it.each(['Z999', 'A5', 'J12', 'A01', 'a1', '__proto__'])('rejects invented item %s', (id) => {
    expect(isScopeItemId(id)).toBe(false);
  });
});
