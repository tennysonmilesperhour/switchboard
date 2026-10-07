import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEOCODER_ENDPOINT,
  DEFAULT_MAP_STYLES,
  geocoderEndpoint,
  mapConnectSources,
  mapStyleConfig,
  nominatimSearchUrl,
  nominatimUrl,
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

describe('map styles', () => {
  it('default to OpenFreeMap, light and dark', () => {
    expect(mapStyleConfig(undefined, undefined)).toEqual(DEFAULT_MAP_STYLES);
    expect(mapStyleConfig('  ', '')).toEqual(DEFAULT_MAP_STYLES);
  });

  it('use a configured https style, for both appearances unless a dark one is given', () => {
    expect(mapStyleConfig('https://maps.example.com/style.json?key=k', undefined)).toEqual({
      light: 'https://maps.example.com/style.json?key=k',
      dark: 'https://maps.example.com/style.json?key=k',
    });
    expect(
      mapStyleConfig('https://maps.example.com/light.json', 'https://maps.example.com/dark.json'),
    ).toEqual({
      light: 'https://maps.example.com/light.json',
      dark: 'https://maps.example.com/dark.json',
    });
  });

  it('ignore anything that is not plain https', () => {
    for (const bad of [
      'http://maps.example.com/style.json',
      'https://user:pass@maps.example.com/style.json',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(mapStyleConfig(bad, bad)).toEqual(DEFAULT_MAP_STYLES);
    }
  });

  it('let the browser reach exactly the style origins, once each', () => {
    expect(mapConnectSources(DEFAULT_MAP_STYLES)).toBe('https://tiles.openfreemap.org');
    expect(
      mapConnectSources({
        light: 'https://a.example.com/light.json',
        dark: 'https://b.example.com/dark.json',
      }),
    ).toBe('https://a.example.com https://b.example.com');
  });
});
