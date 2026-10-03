import { describe, expect, it } from 'vitest';
import type { MapLayerKey, MapMarker } from './geo';
import {
  buildDirectory,
  DIRECTORY_ORDER,
  LAYER_META,
  MAP_LAYERS,
  layerEmptyHint,
  mapFocusHref,
  mapFocusKey,
  markerKey,
} from './map-directory';

function marker(partial: Partial<MapMarker> & { id: string; layer: MapLayerKey }): MapMarker {
  return {
    label: partial.id,
    lat: 40.76,
    lng: -111.89,
    ...partial,
  };
}

// Salt Lake City reference points, roughly 2 km and 5 km from downtown.
const DOWNTOWN = { lat: 40.766, lng: -111.891 };
const LIBERTY_PARK = { lat: 40.7466, lng: -111.8747 };
const RED_BUTTE = { lat: 40.7663, lng: -111.826 };

describe('buildDirectory', () => {
  it('groups markers by layer, in chip order with the viewer first', () => {
    const sections = buildDirectory(
      [
        marker({ id: 'z1', layer: 'zones' }),
        marker({ id: 'p1', layer: 'plans' }),
        marker({ id: 'self', layer: 'you' }),
        marker({ id: 'm1', layer: 'places' }),
        marker({ id: 'l1', layer: 'live' }),
      ],
      null,
    );
    expect(sections.map((section) => section.key)).toEqual(DIRECTORY_ORDER);
  });

  it('omits layers with nothing to show', () => {
    const sections = buildDirectory([marker({ id: 'z1', layer: 'zones' })], null);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('zones');
    expect(sections[0].label).toBe(LAYER_META.zones.label);
  });

  it('sorts a layer nearest-first when the viewer has a point', () => {
    const sections = buildDirectory(
      [
        marker({ id: 'far', layer: 'zones', label: 'Red Butte', ...RED_BUTTE }),
        marker({ id: 'near', layer: 'zones', label: 'Liberty Park', ...LIBERTY_PARK }),
      ],
      DOWNTOWN,
    );
    expect(sections[0].entries.map((entry) => entry.marker.id)).toEqual(['near', 'far']);
  });

  it('falls back to alphabetical order when the viewer has no point', () => {
    const sections = buildDirectory(
      [
        marker({ id: 'b', layer: 'zones', label: 'Sugar House', ...RED_BUTTE }),
        marker({ id: 'a', layer: 'zones', label: 'Avenues', ...LIBERTY_PARK }),
      ],
      null,
    );
    expect(sections[0].entries.map((entry) => entry.marker.label)).toEqual([
      'Avenues',
      'Sugar House',
    ]);
    expect(sections[0].entries.every((entry) => entry.distanceM === null)).toBe(true);
    expect(sections[0].entries.every((entry) => entry.distanceLabel === '')).toBe(true);
  });

  it('labels how far each pin is from the viewer', () => {
    const [zones] = buildDirectory(
      [marker({ id: 'z', layer: 'zones', label: 'Liberty Park', ...LIBERTY_PARK })],
      DOWNTOWN,
    );
    // ~2.4 km downtown to Liberty Park.
    expect(zones.entries[0].distanceM).toBeGreaterThan(2_000);
    expect(zones.entries[0].distanceM).toBeLessThan(3_000);
    expect(zones.entries[0].distanceLabel).toMatch(/^2\.\d km$/);
  });

  it('never puts a distance on the viewer’s own pin', () => {
    const [you] = buildDirectory([marker({ id: 'self', layer: 'you', ...DOWNTOWN })], DOWNTOWN);
    expect(you.entries[0].distanceLabel).toBe('');
  });

  it('keeps every marker, including duplicates of the same label', () => {
    const sections = buildDirectory(
      [
        marker({ id: 'a', layer: 'live', label: 'Nina' }),
        marker({ id: 'b', layer: 'live', label: 'Nina' }),
      ],
      DOWNTOWN,
    );
    expect(sections[0].entries).toHaveLength(2);
  });

  it('returns nothing for an empty map', () => {
    expect(buildDirectory([], DOWNTOWN)).toEqual([]);
  });
});

describe('layerEmptyHint', () => {
  // A layer switched on with nothing in it must always say why — a silent empty
  // layer is the same dead end as a count with no location.
  it('gives every layer a hint in both sharing states', () => {
    for (const key of DIRECTORY_ORDER) {
      for (const sharing of [true, false]) {
        expect(layerEmptyHint(key, { sharing }).length).toBeGreaterThan(20);
      }
    }
  });

  it('explains that live discovery is mutual until you share', () => {
    expect(layerEmptyHint('live', { sharing: false })).toMatch(/mutual/i);
    expect(layerEmptyHint('live', { sharing: true })).toMatch(/no one else/i);
  });

  it('never reads a failed nearby check as nobody being around', () => {
    const hint = layerEmptyHint('live', { sharing: true, nearbyFailed: true });
    expect(hint).toMatch(/nearby check/i);
    expect(hint).not.toMatch(/no one else/i);
  });

  it('points an empty Plans layer at the control that fills it', () => {
    expect(layerEmptyHint('plans', { sharing: false })).toMatch(/Locate my plans/);
  });
});

describe('focus keys', () => {
  // The key a link puts in the URL and the key the map matches against are the
  // same function, so a "show me on the map" link can never point at nothing.
  it('round-trips a marker through the link a surface would build', () => {
    const zone = marker({ id: 'a3f1', layer: 'zones', label: 'Liberty Park Serendipity' });
    const href = mapFocusHref('zones', zone.id);
    const key = new URL(href, 'https://example.test').searchParams.get('focus');
    expect(key).toBe(markerKey(zone));
  });

  it('keeps ids from different layers apart', () => {
    expect(mapFocusKey('zones', 'same-id')).not.toBe(mapFocusKey('plans', 'same-id'));
  });

  it('escapes an id so it cannot smuggle extra query params', () => {
    expect(mapFocusHref('zones', 'a&b=c')).toBe('/map?focus=zones%3Aa%26b%3Dc');
  });
});

describe('layer metadata', () => {
  it('describes every layer key exactly once', () => {
    expect(Object.keys(LAYER_META).sort()).toEqual([...DIRECTORY_ORDER].sort());
  });

  it('keeps the viewer’s own pin out of the toggleable chips', () => {
    expect(MAP_LAYERS).not.toContain('you');
    expect(DIRECTORY_ORDER[0]).toBe('you');
  });
});
