'use client';

import { useCallback, useEffect, useRef } from 'react';
import type * as ML from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyleConfig, type MapLayerKey, type MapMarker } from '@/lib/geo';

// Configurable per deployment. Read here, in client code, as literal
// `process.env.NEXT_PUBLIC_*` references so the build inlines them;
// `mapStyleConfig` validates and falls back to OpenFreeMap. The proxy's CSP
// reads the same variables, so whatever is drawn here is also allowed there.
const STYLES = mapStyleConfig(
  process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK,
);

/** Pins are 44px targets: the smallest a thumb can reliably hit. */
const PIN_PX = 44;

/** Pin colours per layer, drawn as a small dot rather than an emoji. */
const LAYER_COLOUR: Record<MapLayerKey, string> = {
  plans: '#dc2558',
  zones: '#d68a1a',
  places: '#8a38f5',
  live: '#2f8f5b',
  you: '#2563eb',
};

/** Zoom used when bringing a single marker into view: a few streets around it. */
const FOCUS_ZOOM = 14;

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
 * `Popup.setHTML` would inject them as raw HTML. `href` is always an
 * app-internal path we constructed, so it's safe to assign. (See docs/SECURITY.md §6.)
 */
function buildPopup(marker: MapMarker): HTMLElement {
  const root = document.createElement('div');
  root.className = 'sb-map-popup';
  const title = document.createElement('strong');
  title.textContent = marker.label;
  root.appendChild(title);
  if (marker.sub) {
    const sub = document.createElement('span');
    sub.textContent = marker.sub;
    root.appendChild(sub);
  }
  if (marker.href) {
    const link = document.createElement('a');
    link.href = marker.href;
    link.textContent = 'Open';
    root.appendChild(link);
  }
  return root;
}

/** A pin: a real button, so it is reachable and named for keyboards and screen readers. */
function buildPin(marker: MapMarker): HTMLElement {
  const isSelf = marker.layer === 'you';
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = isSelf ? 'sb-map-pin sb-map-pin-you' : 'sb-map-pin';
  pin.title = marker.label;
  pin.setAttribute('aria-label', marker.label);
  pin.style.width = `${PIN_PX}px`;
  pin.style.height = `${PIN_PX}px`;
  pin.style.setProperty('--pin', LAYER_COLOUR[marker.layer]);
  const dot = document.createElement('span');
  dot.className = 'sb-map-pin-dot';
  pin.appendChild(dot);
  return pin;
}

/**
 * Whether the app is currently in a dark appearance. Themes are token sets on
 * `<html>` (several of them dark), so read the resolved page colour rather than
 * enumerating theme names.
 */
function prefersDarkMap(): boolean {
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--color-paper');
  const hex = paper.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * Warm the basemap toward the active theme: its land colour becomes the app's
 * surface colour, so the map reads as part of the page instead of a cutout.
 */
function tintToTheme(map: ML.Map) {
  const land = getComputedStyle(document.documentElement).getPropertyValue('--color-cream').trim();
  if (!land) return;
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', land);
  }
}

/** The map itself: MapLibre vector tiles. Rendered client-only (it needs `window`). */
export function MapCanvas({
  markers,
  focus,
  fitNonce = 0,
  heightClass = 'h-[60vh]',
  maxFitZoom = FOCUS_ZOOM,
}: {
  markers: MapMarker[];
  /** Fly to one marker and open its popup. See {@link MapFocus}. */
  focus?: MapFocus | null;
  /** Bump to re-frame the viewport around everything currently plotted. */
  fitNonce?: number;
  /** Tailwind height for the map box. */
  heightClass?: string;
  /** How far a fit may zoom in. Street level (17) for two people finding each other. */
  maxFitZoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ML.Map | null>(null);
  const libRef = useRef<typeof ML | null>(null);
  // Fit the viewport to the data exactly once. Live layers refresh their markers
  // every few seconds; refitting each time would yank the map around under the
  // user. After the first fit, the viewport is theirs to control — "Fit all"
  // (fitNonce) and the directory (focus) are how it moves after that.
  const didFitRef = useRef(false);
  // The plotted markers, readable without re-running the fit effect.
  const markersRef = useRef<MapMarker[]>(markers);
  const pinsRef = useRef(new Map<string, ML.Marker>());
  // A focus that arrived before the piece it needs. The map is created after an
  // async import and the pins are plotted after that, so a focus from a link
  // (/map?focus=…) lands before either exists; it waits here instead of being
  // silently dropped, which is precisely the "the map ignored me" failure this
  // whole screen is meant to stop having.
  const pendingFocusRef = useRef<MapFocus | null>(null);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  /** Move to whatever focus is queued, as far as the map is currently able. */
  const drainFocus = useCallback(() => {
    const map = mapRef.current;
    const target = pendingFocusRef.current;
    if (!map || !target) return;
    // A deliberate move outranks the one-time auto-fit, which would otherwise
    // zoom back out the next time the live layers refresh.
    didFitRef.current = true;
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      essential: false,
    });
    const pin = pinsRef.current.get(target.markerId);
    if (pin) {
      for (const [id, other] of pinsRef.current) {
        if (id !== target.markerId && other.getPopup()?.isOpen()) other.togglePopup();
      }
      if (!pin.getPopup()?.isOpen()) pin.togglePopup();
      pendingFocusRef.current = null;
    }
  }, []);

  /** Draw every marker, keeping whichever popup was open across the redraw. */
  const plot = useCallback(
    (list: MapMarker[]) => {
      const lib = libRef.current;
      const map = mapRef.current;
      if (!lib || !map) return;
      let openPopupId: string | null = null;
      for (const [id, pin] of pinsRef.current) {
        if (pin.getPopup()?.isOpen()) openPopupId = id;
        pin.remove();
      }
      pinsRef.current.clear();
      const bounds = new lib.LngLatBounds();
      for (const marker of list) {
        const popup = new lib.Popup({ offset: 14, maxWidth: '260px', focusAfterOpen: false })
          .setDOMContent(buildPopup(marker));
        const pin = new lib.Marker({ element: buildPin(marker), anchor: 'center' })
          .setLngLat([marker.lng, marker.lat])
          .setPopup(popup)
          .addTo(map);
        if (marker.layer === 'you') pin.getElement().style.zIndex = '2';
        pinsRef.current.set(marker.id, pin);
        bounds.extend([marker.lng, marker.lat]);
      }
      if (list.length > 0 && !didFitRef.current) {
        // The explorer's first view stays a neighbourhood (13); a caller asking
        // for street level gets it from the start.
        map.fitBounds(bounds, {
          padding: 48,
          maxZoom: maxFitZoom > FOCUS_ZOOM ? maxFitZoom : 13,
          animate: false,
        });
        didFitRef.current = true;
      }
      if (openPopupId) pinsRef.current.get(openPopupId)?.togglePopup();
      drainFocus();
      pendingFocusRef.current = null;
    },
    [drainFocus, maxFitZoom],
  );
  const plotRef = useRef(plot);
  useEffect(() => {
    plotRef.current = plot;
  }, [plot]);

  // Create the map once, on mount.
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let media: MediaQueryList | null = null;
    let onScheme: (() => void) | null = null;
    const pins = pinsRef.current;
    void (async () => {
      const lib = await import('maplibre-gl');
      if (cancelled || !containerRef.current || mapRef.current) return;
      let dark = prefersDarkMap();
      containerRef.current.classList.toggle('sb-map-dark', dark);
      const map = new lib.Map({
        container: containerRef.current,
        style: dark ? STYLES.dark : STYLES.light,
        center: [0, 20],
        zoom: 1,
        // A page scroll or one-finger swipe over the map moves the page, not the
        // map: ctrl/⌘ + scroll zooms, two fingers pan. A phone user scrolling
        // past the map never gets stuck inside it.
        cooperativeGestures: true,
        // Rotation and tilt only disorient on a "where is everyone" map.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      map.on('style.load', () => tintToTheme(map));
      libRef.current = lib;
      mapRef.current = map;

      // Follow the app's appearance. Pins and popups are DOM overlays, so they
      // survive a style swap untouched.
      const sync = () => {
        const next = prefersDarkMap();
        if (next === dark) {
          tintToTheme(map);
          return;
        }
        dark = next;
        map.getContainer().classList.toggle('sb-map-dark', dark);
        map.setStyle(dark ? STYLES.dark : STYLES.light);
      };
      observer = new MutationObserver(sync);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class', 'style'],
      });
      media = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
      onScheme = sync;
      media?.addEventListener('change', onScheme);

      plotRef.current(markersRef.current);
      drainFocus();
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (media && onScheme) media.removeEventListener('change', onScheme);
      mapRef.current?.remove();
      mapRef.current = null;
      pins.clear();
    };
    // `drainFocus` is stable (refs only), so this still runs exactly once.
  }, [drainFocus]);

  // Re-plot whenever the visible set changes (a layer toggled, data refreshed).
  useEffect(() => {
    plot(markers);
  }, [markers, plot]);

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
    const lib = libRef.current;
    const map = mapRef.current;
    if (!lib || !map || markersRef.current.length === 0) return;
    const bounds = new lib.LngLatBounds();
    for (const marker of markersRef.current) bounds.extend([marker.lng, marker.lat]);
    didFitRef.current = true;
    for (const pin of pinsRef.current.values()) {
      if (pin.getPopup()?.isOpen()) pin.togglePopup();
    }
    map.fitBounds(bounds, { padding: 48, maxZoom: maxFitZoom });
  }, [fitNonce, maxFitZoom]);

  // `isolate` gives the map its own stacking context, so MapLibre's control and
  // popup z-indexes stay inside it and never out-stack app chrome like the More
  // sheet overlay (z-40).
  return (
    <div
      ref={containerRef}
      className={`sb-map isolate ${heightClass} w-full overflow-hidden rounded-card border border-line bg-cream`}
    />
  );
}
