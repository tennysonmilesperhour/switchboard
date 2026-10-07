'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tileConfig, type MapLayerKey, type MapMarker } from '@/lib/geo';

// Configurable per deployment (a hosted tile provider instead of the public
// OpenStreetMap servers, whose usage policy does not cover production apps).
// Read here, in client code, as literal `process.env.NEXT_PUBLIC_*` references
// so the build inlines them; `tileConfig` validates and falls back.
const TILES = tileConfig(
  process.env.NEXT_PUBLIC_MAP_TILE_URL,
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION,
);

/** Pins are 44px targets: the smallest a thumb can reliably hit. */
const PIN_PX = 44;

/** Pin colours per layer, drawn as a small dot rather than an emoji. */
const LAYER_COLOUR: Record<MapLayerKey, string> = {
  plans: '#c2562f',
  zones: '#b8892e',
  places: '#4f6f52',
  live: '#2f8f5b',
  you: '#2563eb',
};

/**
 * A request to bring one marker into view. `nonce` is bumped on every request so
 * asking twice for the same marker still moves the map, and the coordinate rides
 * along so the pan never depends on the marker having finished re-plotting (the
 * live layers re-render every few seconds).
 */
export interface MapFocus {
  markerId: string;
  lat: number;
  lng: number;
  nonce: number;
}

/**
 * Build a popup as real DOM nodes with `textContent`, never an HTML string:
 * labels are user-controlled (event titles, place names, display names) and
 * Leaflet's string API would inject them as raw HTML. `href` is always an
 * app-internal path we constructed, so it's safe to assign. (See docs/SECURITY.md §6.)
 */
function buildPopup(marker: MapMarker): HTMLElement {
  const root = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = marker.label;
  root.appendChild(title);
  if (marker.sub) {
    root.appendChild(document.createElement('br'));
    root.appendChild(document.createTextNode(marker.sub));
  }
  if (marker.href) {
    root.appendChild(document.createElement('br'));
    const link = document.createElement('a');
    link.href = marker.href;
    link.textContent = 'Open';
    root.appendChild(link);
  }
  return root;
}

/** The Leaflet map itself. Rendered client-only (it needs `window`). */
export function LeafletCanvas({
  markers,
  focus,
  fitNonce = 0,
  heightClass = 'h-[60vh]',
  maxFitZoom = 15,
}: {
  markers: MapMarker[];
  /** Pan/zoom to one marker and open its popup. See {@link MapFocus}. */
  focus?: MapFocus | null;
  /** Bump to re-frame the viewport around everything currently plotted. */
  fitNonce?: number;
  /** Tailwind height for the map box. */
  heightClass?: string;
  /** How far a fit may zoom in. Street level (18) for two people finding each other. */
  maxFitZoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Fit the viewport to the data exactly once. Live layers refresh their markers
  // every few seconds; refitting each time would yank the map around under the
  // user. After the first fit, the viewport is theirs to control — "Fit all"
  // (fitNonce) and the directory (focus) are how it moves after that.
  const didFitRef = useRef(false);
  // The plotted markers, readable without re-running the fit effect.
  const markersRef = useRef<MapMarker[]>(markers);
  const pinsRef = useRef(new Map<string, L.Marker>());
  // A focus that arrived before the piece it needs. The map is created after an
  // async import and the pins are plotted after another, so a focus from a link
  // (/map?focus=…) lands before either exists; it waits here instead of being
  // silently dropped, which is precisely the "the map ignored me" failure this
  // whole screen is meant to stop having.
  const pendingFocusRef = useRef<MapFocus | null>(null);
  // On a touch screen a one-finger drag over the map used to pan the map and
  // never the page, so a phone user scrolling past it got stuck inside it. There
  // the map starts still: one finger scrolls the page, pins stay tappable, and
  // "Move map" turns dragging and pinch-zoom on until "Done".
  const [touch, setTouch] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  const setMovable = useCallback((movable: boolean) => {
    const map = mapRef.current;
    if (map) {
      if (movable) {
        map.dragging.enable();
        map.touchZoom.enable();
      } else {
        map.dragging.disable();
        map.touchZoom.disable();
      }
    }
    setUnlocked(movable);
  }, []);

  /** Move to whatever focus is queued, as far as the map is currently able. */
  const drainFocus = useCallback(() => {
    const map = mapRef.current;
    const target = pendingFocusRef.current;
    if (!map || !target) return;
    // A deliberate move outranks the one-time auto-fit, which would otherwise
    // zoom back out the next time the live layers refresh.
    didFitRef.current = true;
    map.setView([target.lat, target.lng], Math.max(map.getZoom() ?? 0, 15));
    const pin = pinsRef.current.get(target.markerId);
    if (pin) {
      pin.openPopup();
      pendingFocusRef.current = null;
    }
  }, []);

  // Create the map once, on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const leaflet = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const coarse =
        typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      const map = leaflet
        .map(containerRef.current, {
          scrollWheelZoom: false,
          dragging: !coarse,
          touchZoom: !coarse,
        })
        .setView([20, 0], 2);
      setTouch(coarse);
      // Raster tiles load as <img>, which the CSP allows (`img-src https:`); a
      // vector/WebGL basemap would need cross-origin fetch the CSP forbids.
      leaflet
        .tileLayer(TILES.url, {
          attribution: TILES.attribution,
          maxZoom: 19,
        })
        .addTo(map);
      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      // The container may finish sizing after mount; re-measure so tiles fill it.
      setTimeout(() => map.invalidateSize(), 0);
      drainFocus();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // `drainFocus` is stable (refs only), so this still runs exactly once.
  }, [drainFocus]);

  // Re-plot whenever the visible set changes (a layer toggled, data refreshed).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const leaflet = (await import('leaflet')).default;
      const map = mapRef.current;
      const group = layerRef.current;
      if (cancelled || !map || !group) return;
      let openPopupId: string | null = null;
      for (const [id, pin] of pinsRef.current) {
        if (pin.getPopup()?.isOpen()) {
          openPopupId = id;
          break;
        }
      }
      group.clearLayers();
      pinsRef.current.clear();
      const bounds: [number, number][] = [];
      for (const marker of markers) {
        const isSelf = marker.layer === 'you';
        const icon = leaflet.divIcon({
          className: isSelf ? 'sb-map-pin sb-map-pin-you' : 'sb-map-pin',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:${PIN_PX}px;height:${PIN_PX}px"><span style="display:block;box-sizing:border-box;width:${isSelf ? 20 : 16}px;height:${isSelf ? 20 : 16}px;border-radius:50%;background:${LAYER_COLOUR[marker.layer]};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span></div>`,
          iconSize: [PIN_PX, PIN_PX],
          iconAnchor: [PIN_PX / 2, PIN_PX / 2],
        });
        const pin = leaflet
          // `title` gives the keyboard-focusable pin an accessible name; an
          // glyph-only divIcon otherwise reads as an unlabelled button.
          .marker([marker.lat, marker.lng], {
            icon,
            title: marker.label,
            zIndexOffset: isSelf ? 1000 : 0,
          })
          .addTo(group)
          .bindPopup(buildPopup(marker));
        pinsRef.current.set(marker.id, pin);
        bounds.push([marker.lat, marker.lng]);
      }
      if (bounds.length > 0 && !didFitRef.current) {
        // The explorer's first view stays a neighbourhood (14); a caller asking
        // for street level gets it from the start.
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: maxFitZoom > 15 ? maxFitZoom : 14 });
        didFitRef.current = true;
      }
      if (openPopupId) {
        const restored = pinsRef.current.get(openPopupId);
        if (restored) restored.openPopup();
      }
      drainFocus();
      pendingFocusRef.current = null;
    })();
    return () => {
      cancelled = true;
    };
  }, [markers, drainFocus, maxFitZoom]);

  // Bring one marker into view and open its popup — the map half of "show me
  // where this is". The coordinate rides on the request rather than being read
  // off the plotted pin, so a focus that lands mid re-plot still moves the map.
  useEffect(() => {
    if (!focus) return;
    pendingFocusRef.current = focus;
    drainFocus();
  }, [focus, drainFocus]);

  // Re-frame around everything showing ("Fit all"). Reads the current markers
  // from a ref so this runs on request, not on every data refresh.
  useEffect(() => {
    if (fitNonce === 0) return;
    const map = mapRef.current;
    if (!map) return;
    const bounds = markersRef.current.map(
      (marker) => [marker.lat, marker.lng] as [number, number],
    );
    if (bounds.length === 0) return;
    didFitRef.current = true;
    map.closePopup();
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: maxFitZoom });
  }, [fitNonce, maxFitZoom]);

  // `isolate` (isolation: isolate) gives the map its own stacking context.
  // Leaflet sets high z-indexes on its panes and controls (zoom buttons and
  // attribution reach z-index 1000); the `.leaflet-container` itself creates no
  // stacking context, so without this those values leak into the page's root
  // context and out-stack app chrome like the More sheet overlay (z-40),
  // painting the map's controls on top of it. Isolating scopes them to the map.
  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`isolate ${heightClass} w-full overflow-hidden rounded-card border border-line`}
      />
      {touch && (
        <button
          type="button"
          onClick={() => setMovable(!unlocked)}
          aria-pressed={unlocked}
          className="absolute bottom-3 left-3 z-10 inline-flex min-h-11 items-center rounded-pill border border-line bg-card px-4 text-xs font-bold text-ink shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          {unlocked ? 'Done moving the map' : 'Move map'}
        </button>
      )}
    </div>
  );
}
