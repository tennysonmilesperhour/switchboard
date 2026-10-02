/**
 * The map's directory: turning a pile of plotted markers into a readable list of
 * "here is what is on your map, and how far away it is".
 *
 * The layer chips count what's plotted, but a count is not a location. A zone
 * anchored on the other side of the valley is off-screen the moment the map
 * zooms anywhere else, so "Zones 1" reads as a promise the map never keeps.
 * Everything here is pure so the list, its ordering, and the sentence shown when
 * a layer is empty are all unit-testable without a map.
 */
import { distanceMeters, formatDistance, type MapLayerKey, type MapMarker, type MapPoint } from '@/lib/geo';

/** Label + pin emoji for every layer, including the viewer's own pin. */
export const LAYER_META: Record<MapLayerKey, { label: string; emoji: string }> = {
  you: { label: 'You', emoji: '🧭' },
  live: { label: 'Live', emoji: '🟢' },
  plans: { label: 'Plans', emoji: '📅' },
  zones: { label: 'Zones', emoji: '✨' },
  places: { label: 'Shared places', emoji: '📍' },
};

/** The layers a viewer can switch on and off, in the order the chips appear.
 *  `you` is absent on purpose: you always see your own pin while sharing. */
export const MAP_LAYERS: MapLayerKey[] = ['live', 'plans', 'zones', 'places'];

/** Directory order — yourself first, then the layers as the chips list them. */
export const DIRECTORY_ORDER: MapLayerKey[] = ['you', ...MAP_LAYERS];

/**
 * The stable key naming one pin in a `/map?focus=…` link, so a surface that
 * knows about a thing (a zone page, say) can send the reader to that thing on
 * the map rather than to the map in general. Layer-qualified because the ids
 * come from different tables.
 */
export function mapFocusKey(layer: MapLayerKey, id: string): string {
  return `${layer}:${id}`;
}

/** The focus key for an already-built marker. */
export function markerKey(marker: MapMarker): string {
  return mapFocusKey(marker.layer, marker.id);
}

/** A `/map` URL that opens with one pin already centred and its popup showing. */
export function mapFocusHref(layer: MapLayerKey, id: string): string {
  return `/map?focus=${encodeURIComponent(mapFocusKey(layer, id))}`;
}

export interface DirectoryEntry {
  marker: MapMarker;
  /** Metres from the viewer's own point, or null when they have no location. */
  distanceM: number | null;
  /** Pre-formatted distance ("1.3 km"); empty string when unknown. */
  distanceLabel: string;
}

export interface DirectorySection {
  key: MapLayerKey;
  label: string;
  emoji: string;
  entries: DirectoryEntry[];
}

/**
 * Group markers into per-layer sections. Within a layer, nearest first when the
 * viewer has a point of their own; otherwise alphabetical, which at least stays
 * stable while the live layer refreshes underneath.
 */
export function buildDirectory(
  markers: MapMarker[],
  from: MapPoint | null,
): DirectorySection[] {
  const byLayer = new Map<MapLayerKey, DirectoryEntry[]>();
  for (const marker of markers) {
    const raw = from ? distanceMeters(from, { lat: marker.lat, lng: marker.lng }) : Number.NaN;
    const distanceM = Number.isFinite(raw) ? raw : null;
    const entry: DirectoryEntry = {
      marker,
      distanceM,
      // Your own pin is always "here"; labelling it 0 m is noise.
      distanceLabel: distanceM === null || marker.layer === 'you' ? '' : formatDistance(distanceM),
    };
    const bucket = byLayer.get(marker.layer);
    if (bucket) bucket.push(entry);
    else byLayer.set(marker.layer, [entry]);
  }

  const sections: DirectorySection[] = [];
  for (const key of DIRECTORY_ORDER) {
    const entries = byLayer.get(key);
    if (!entries || entries.length === 0) continue;
    entries.sort((a, b) => {
      if (a.distanceM !== null && b.distanceM !== null && a.distanceM !== b.distanceM) {
        return a.distanceM - b.distanceM;
      }
      return a.marker.label.localeCompare(b.marker.label);
    });
    sections.push({ key, label: LAYER_META[key].label, emoji: LAYER_META[key].emoji, entries });
  }
  return sections;
}

/**
 * Why a switched-on layer has nothing in it, and what to do about it. An empty
 * layer that says nothing is the same dead end as a count with no location: the
 * reader can't tell whether the feature is broken, empty, or not for them.
 */
export function layerEmptyHint(
  key: MapLayerKey,
  options: { sharing: boolean; nearbyFailed?: boolean },
): string {
  switch (key) {
    case 'live':
      // A failed check is not an empty one; the sharing card carries its code.
      if (options.sharing && options.nearbyFailed) {
        return 'Can’t say who’s around until the nearby check goes through. The card above says why, and it tries again on its own.';
      }
      return options.sharing
        ? 'No one else is sharing near you right now. People appear here the moment they turn their own sharing on.'
        : 'Seeing people is mutual — turn your own sharing on above and anyone else sharing nearby appears here.';
    case 'plans':
      return 'Plans appear once they have a place. Add an address to a plan, then tap “Locate my plans”.';
    case 'zones':
      return 'Zones appear once they’re anchored to a place. Add a location when you create one, or ask the organizer to.';
    case 'places':
      return 'Only your own check-ins are plotted here. Share a place from Moments and it lands on the map.';
    case 'you':
      return 'Your own pin appears while you’re sharing your location.';
  }
}
