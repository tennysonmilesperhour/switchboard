import { describe, expect, it } from 'vitest';
import {
  duplicateIdea,
  linkHostname,
  normalizeLinkUrl,
  prepareOptionFields,
  splitLinkFromLabel,
} from './poll-option-input';

describe('normalizeLinkUrl', () => {
  it('adds https to a bare address', () => {
    expect(normalizeLinkUrl('utahstatefair.com/tickets')).toBe('https://utahstatefair.com/tickets');
  });
  it('keeps http and https addresses as typed', () => {
    expect(normalizeLinkUrl('http://example.com/a')).toBe('http://example.com/a');
    expect(normalizeLinkUrl(' https://example.com/a ')).toBe('https://example.com/a');
  });
  it('returns null for nothing', () => {
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl(undefined)).toBeNull();
  });
  it('refuses anything that is not a web address', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toMatchObject({ error: expect.any(String) });
    expect(normalizeLinkUrl('mailto:a@b.co')).toMatchObject({ error: expect.any(String) });
    expect(normalizeLinkUrl('not a link')).toMatchObject({ error: expect.any(String) });
  });
});

describe('splitLinkFromLabel', () => {
  it('lifts a pasted address out of the name', () => {
    expect(splitLinkFromLabel('Greek Festival: https://www.saltlakegreekfestival.com/')).toEqual({
      label: 'Greek Festival',
      linkUrl: 'https://www.saltlakegreekfestival.com/',
    });
  });
  it('handles a dash separator and a trailing full stop', () => {
    expect(splitLinkFromLabel('Wise Guys Comedy - https://www.wiseguyscomedy.com/shows.')).toEqual({
      label: 'Wise Guys Comedy',
      linkUrl: 'https://www.wiseguyscomedy.com/shows',
    });
  });
  it('names a bare link after its site', () => {
    expect(splitLinkFromLabel('https://www.utahstatefair.com/')).toEqual({
      label: 'utahstatefair.com',
      linkUrl: 'https://www.utahstatefair.com/',
    });
  });
  it('leaves a name with no address alone', () => {
    expect(splitLinkFromLabel('  Tacos  ')).toEqual({ label: 'Tacos', linkUrl: null });
  });
});

describe('prepareOptionFields', () => {
  it('prefers an explicit link and keeps the name whole', () => {
    expect(
      prepareOptionFields({ label: 'State Fair', linkUrl: 'utahstatefair.com', detail: ' rides! ' }),
    ).toEqual({
      ok: true,
      fields: { label: 'State Fair', detail: 'rides!', linkUrl: 'https://utahstatefair.com/' },
    });
  });
  it('splits the link out of the name when none was given', () => {
    expect(prepareOptionFields({ label: 'Geek Festival: https://a.example/x' })).toEqual({
      ok: true,
      fields: { label: 'Geek Festival', detail: null, linkUrl: 'https://a.example/x' },
    });
  });
  it('rejects an empty name and an over-long description', () => {
    expect(prepareOptionFields({ label: '   ' })).toEqual({ ok: false, error: 'Suggestion is empty' });
    expect(prepareOptionFields({ label: 'x', detail: 'a'.repeat(501) }).ok).toBe(false);
    expect(prepareOptionFields({ label: 'a'.repeat(121) }).ok).toBe(false);
  });
  it('surfaces a bad link as the sentence to fix', () => {
    expect(prepareOptionFields({ label: 'x', linkUrl: 'javascript:alert(1)' })).toEqual({
      ok: false,
      error: 'Links need to start with http:// or https://.',
    });
  });
});

describe('linkHostname', () => {
  it('shows the site, not the path', () => {
    expect(linkHostname('https://www.wiseguyscomedy.com/shows/123')).toBe('wiseguyscomedy.com');
  });
});

describe('duplicateIdea', () => {
  const list = [
    { id: 'a', label: 'Pizza' },
    { id: 'b', label: 'Greek place on 5th' },
  ];

  it('treats case, spacing, and trailing punctuation as the same idea', () => {
    expect(duplicateIdea('pizza ', list)?.id).toBe('a');
    expect(duplicateIdea('PIZZA!', list)?.id).toBe('a');
    expect(duplicateIdea('greek  place on 5th.', list)?.id).toBe('b');
  });

  it('lets different ideas through', () => {
    expect(duplicateIdea('Pizza place', list)).toBeNull();
    expect(duplicateIdea('Tacos', list)).toBeNull();
  });

  it('ignores the idea being edited', () => {
    expect(duplicateIdea('Pizza', list, 'a')).toBeNull();
  });
});
