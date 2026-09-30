import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEOCODER_ENDPOINT,
  DEFAULT_TILES,
  geocoderEndpoint,
  nominatimSearchUrl,
  nominatimUrl,
  tileConfig,
} from './geo';

describe('the geocoder endpoint', () => {
  it('defaults to public Nominatim', () => {
    expect(geocoderEndpoint(undefined)).toBe(DEFAULT_GEOCODER_ENDPOINT);
    expect(geocoderEndpoint('  ')).toBe(DEFAULT_GEOCODER_ENDPOINT);
  });

  it('accepts a configured https search endpoint', () => {
    expect(geocoderEndpoint('https://geo.example.com/search')).toBe(
      'https://geo.example.com/search',
    );
    expect(nominatimUrl('Café Luna', 'https://geo.example.com/search')).toMatch(
      /^https:\/\/geo\.example\.com\/search\?q=Caf%C3%A9\+Luna&format=jsonv2&limit=1$/,
    );
    expect(nominatimSearchUrl('park', 3, 'https://geo.example.com/search')).toContain(
      'https://geo.example.com/search?',
    );
  });

  it('refuses anything that could send addresses somewhere unintended', () => {
    for (const bad of [
      'http://geo.example.com/search',
      'https://user:pass@geo.example.com/search',
      'https://geo.example.com/search?key=abc',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(geocoderEndpoint(bad)).toBe(DEFAULT_GEOCODER_ENDPOINT);
    }
  });
});

describe('map tiles', () => {
  it('default to OpenStreetMap', () => {
    expect(tileConfig(undefined, undefined)).toEqual(DEFAULT_TILES);
  });

  it('use a configured https template, keeping a credit', () => {
    expect(tileConfig('https://tiles.example.com/{z}/{x}/{y}.png', 'Example Maps')).toEqual({
      url: 'https://tiles.example.com/{z}/{x}/{y}.png',
      attribution: 'Example Maps',
    });
    expect(tileConfig('https://{s}.tiles.example.com/{z}/{x}/{y}.png', '').attribution).toBe(
      DEFAULT_TILES.attribution,
    );
  });

  it('fall back on an insecure or incomplete template', () => {
    expect(tileConfig('http://tiles.example.com/{z}/{x}/{y}.png', 'x')).toEqual(DEFAULT_TILES);
    expect(tileConfig('https://tiles.example.com/{z}/{x}.png', 'x')).toEqual(DEFAULT_TILES);
  });

  it('strip markup from a configured credit, which Leaflet renders as HTML', () => {
    expect(
      tileConfig('https://tiles.example.com/{z}/{x}/{y}.png', '<img src=x onerror=alert(1)>Maps')
        .attribution,
    ).toBe('img src=x onerror=alert(1)Maps');
  });
});
