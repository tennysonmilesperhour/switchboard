import { describe, expect, it } from 'vitest';
import { linkify } from './linkify';

const links = (s: string) =>
  linkify(s).filter((x) => x.type === 'link').map((x) => (x as { text: string }).text);

describe('linkify', () => {
  it('links a bare URL and keeps surrounding text', () => {
    expect(linkify('menu: https://a.com/x ok')).toEqual([
      { type: 'text', text: 'menu: ' },
      { type: 'link', text: 'https://a.com/x', href: 'https://a.com/x' },
      { type: 'text', text: ' ok' },
    ]);
  });
  it('excludes trailing punctuation', () => {
    expect(links('see https://a.com/x.')).toEqual(['https://a.com/x']);
    expect(links('(https://a.com/x)')).toEqual(['https://a.com/x']);
    expect(links('wow https://a.com/x?!')).toEqual(['https://a.com/x']);
  });
  it('keeps a balanced paren inside the URL', () => {
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    ]);
  });
  it('links www. hosts with an https href', () => {
    expect(linkify('www.a.com')).toEqual([
      { type: 'link', text: 'www.a.com', href: 'https://www.a.com/' },
    ]);
  });
  it('never links other schemes', () => {
    expect(links('javascript:alert(1) data:text/html,x')).toEqual([]);
  });
  it('returns plain text untouched', () => {
    expect(linkify('hello')).toEqual([{ type: 'text', text: 'hello' }]);
    expect(linkify('')).toEqual([]);
  });
});
