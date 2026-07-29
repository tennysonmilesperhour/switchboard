import { describe, it, expect } from 'vitest';
import { serializeJsonLd, safeNextPath, csvCell, safeHttpUrl } from './security';

describe('serializeJsonLd', () => {
  it('produces valid JSON that round-trips', () => {
    const value = { name: 'Taco night', count: 3, nested: { a: [1, 2] } };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });

  it('neutralizes a </script> breakout in a user-controlled string', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    // The literal closing tag must not survive into the output.
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c'); // escaped '<'
    // Still valid JSON with the original meaning preserved.
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>');
  });

  it('escapes < > & and JS line separators', () => {
    const out = serializeJsonLd({ v: '<>&  ' });
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');
    expect(out).toContain('\\u0026');
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });
});

describe('safeNextPath', () => {
  it('allows a simple same-site path', () => {
    expect(safeNextPath('/reset-password')).toBe('/reset-password');
    expect(safeNextPath('/events/123?tab=guests')).toBe('/events/123?tab=guests');
  });

  it('falls back on absolute and protocol-relative URLs (open redirect)', () => {
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('/\\evil.com')).toBe('/');
    expect(safeNextPath('http:evil.com')).toBe('/');
  });

  it('falls back on a userinfo-style value that concatenation would exploit', () => {
    // `${origin}${next}` with next='@evil.com' -> https://app@evil.com
    expect(safeNextPath('@evil.com')).toBe('/');
    expect(safeNextPath('.evil.com')).toBe('/');
  });

  it('falls back on control characters and missing values', () => {
    expect(safeNextPath('/foo\nbar')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('')).toBe('/');
  });

  it('honors a custom fallback', () => {
    expect(safeNextPath('//evil.com', '/reset-password')).toBe('/reset-password');
  });
});

describe('csvCell', () => {
  it('passes through plain values', () => {
    expect(csvCell('Alice')).toBe('Alice');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes RFC-4180 special characters', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('neutralizes spreadsheet formula injection', () => {
    // Leading =,+,-,@ (and tab/CR) get a quote prefix so the host's spreadsheet
    // treats them as text, not a formula. This example also contains quotes and
    // a comma, so it is additionally RFC-4180 quoted (quote prefix, wrap, and
    // double the interior quotes).
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x"")"',
    );
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('combines neutralization with quoting when both apply', () => {
    // '=a,b' -> prefix quote, then needs CSV quoting for the comma.
    expect(csvCell('=a,b')).toBe('"\'=a,b"');
  });
});

describe('safeHttpUrl', () => {
  it('keeps ordinary http(s) links', () => {
    expect(safeHttpUrl('https://example.com/wishlist')).toBe(
      'https://example.com/wishlist',
    );
    expect(safeHttpUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('reads a scheme-less value as https, the way a host types it', () => {
    expect(safeHttpUrl('example.com/registry')).toBe('https://example.com/registry');
    expect(safeHttpUrl('  example.com  ')).toBe('https://example.com/');
  });

  it('rejects script-bearing schemes instead of repairing them', () => {
    // The dangerous case: prepending https:// to a rejected scheme would turn
    // an executable href into a "valid" one.
    for (const value of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(safeHttpUrl(value)).toBeNull();
    }
  });

  it('returns null for empty and unparseable values', () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl('   ')).toBeNull();
    expect(safeHttpUrl('http://')).toBeNull();
  });
});
