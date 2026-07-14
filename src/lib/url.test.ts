import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from './url';

describe('sanitizeUrl', () => {
  it('accepts http and https URLs', () => {
    expect(sanitizeUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('prepends https:// to a bare domain', () => {
    expect(sanitizeUrl('example.com/path')).toBe('https://example.com/path');
  });

  it('rejects javascript: and data: schemes (stored-XSS guard)', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(sanitizeUrl('  JavaScript:alert(1)  ')).toBeNull();
  });

  it('rejects empty and malformed values', () => {
    expect(sanitizeUrl('')).toBeNull();
    expect(sanitizeUrl('   ')).toBeNull();
    expect(sanitizeUrl('not a url')).toBeNull();
    expect(sanitizeUrl('localhost')).toBeNull();
  });
});
