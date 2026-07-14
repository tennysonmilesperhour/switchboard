'use client';

import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapLayerKey, MapMarker } from '@/lib/geo';

const LAYER_EMOJI: Record<MapLayerKey, string> = {
  plans: '📅',
  zones: '✨',
  places: '📍',
};

/**
 * Build a popup as real DOM nodes with `textContent`, never an HTML string:
 * labels are user-controlled (event titles, place names) and Leaflet's
 * string API would inject them as raw HTML. `href` is always an app-internal
 * path we constructed, so it's safe to assign. (See docs/SECURITY.md §6.)
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
export function LeafletCanvas({ markers }: { markers: MapMarker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Create the map once, on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const leaflet = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = leaflet
        .map(containerRef.current, { scrollWheelZoom: false })
        .setView([20, 0], 2);
      // Raster OSM tiles load as <img>, which the CSP allows (`img-src https:`);
      // a vector/WebGL basemap would need cross-origin fetch the CSP forbids.
      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        })
        .addTo(map);
      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      // The container may finish sizing after mount; re-measure so tiles fill it.
      setTimeout(() => map.invalidateSize(), 0);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-plot whenever the visible set changes (a layer toggled, data refreshed).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const leaflet = (await import('leaflet')).default;
      const map = mapRef.current;
      const group = layerRef.current;
      if (cancelled || !map || !group) return;
      group.clearLayers();
      const bounds: [number, number][] = [];
      for (const marker of markers) {
        const icon = leaflet.divIcon({
          className: 'sb-map-pin',
          html: `<div style="font-size:20px;line-height:28px;text-align:center">${LAYER_EMOJI[marker.layer]}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        leaflet
          .marker([marker.lat, marker.lng], { icon })
          .addTo(group)
          .bindPopup(buildPopup(marker));
        bounds.push([marker.lat, marker.lng]);
      }
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className="h-[60vh] w-full overflow-hidden rounded-card border border-line"
    />
  );
}
