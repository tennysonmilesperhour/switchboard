'use client';

import Link from 'next/link';
import type { MapLayerKey, MapMarker } from '@/lib/geo';
import { layerEmptyHint, LAYER_META, type DirectorySection } from '@/lib/map-directory';

/**
 * "What's on the map" — the list that makes the layer counts answerable. Every
 * pin gets a row you can tap to fly the map to it, the distance from you when
 * you're sharing a location, and a link to the thing itself. A layer that's
 * switched on but empty says why instead of saying nothing.
 */
export function MapDirectory({
  sections,
  emptyLayers,
  sharing,
  focusedId,
  onShow,
}: {
  sections: DirectorySection[];
  /** Layers the viewer has switched on that have nothing to plot. */
  emptyLayers: MapLayerKey[];
  /** Whether the viewer is currently sharing their own live location. */
  sharing: boolean;
  focusedId?: string | null;
  onShow: (marker: MapMarker) => void;
}) {
  return (
    <section aria-label="What’s on the map" className="space-y-3">
      <h2 className="font-display text-lg text-ink">What’s on the map</h2>

      {sections.length === 0 && emptyLayers.length === 0 && (
        <p className="text-sm leading-relaxed text-ink-faint">
          Every layer is switched off. Tap a chip above to bring one back.
        </p>
      )}

      {sections.map((section) => (
        <div key={section.key}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-ink-faint">
            <span aria-hidden>{section.emoji}</span> {section.label}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card">
            {section.entries.map(({ marker, distanceLabel }) => (
              <li key={`${marker.layer}:${marker.id}`} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onShow(marker)}
                  aria-label={`Show ${marker.label} on the map`}
                  className={`min-w-0 flex-1 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terracotta ${
                    focusedId === marker.id ? 'bg-terracotta-soft' : 'hover:bg-cream'
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                      {marker.label}
                    </span>
                    {distanceLabel && (
                      <span className="shrink-0 tabular-nums text-xs text-ink-faint">
                        {distanceLabel}
                      </span>
                    )}
                  </span>
                  {marker.sub && (
                    <span className="mt-0.5 block truncate text-xs text-ink-faint">
                      {marker.sub}
                    </span>
                  )}
                </button>
                {marker.href && (
                  <Link
                    href={marker.href}
                    className="shrink-0 px-3 py-2.5 text-xs font-bold text-terracotta-deep underline underline-offset-2"
                  >
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {emptyLayers.map((key) => (
        <p key={key} className="text-xs leading-relaxed text-ink-faint">
          <span className="font-bold text-ink-soft">
            <span aria-hidden>{LAYER_META[key].emoji}</span> {LAYER_META[key].label}:
          </span>{' '}
          {layerEmptyHint(key, { sharing })}
        </p>
      ))}
    </section>
  );
}
