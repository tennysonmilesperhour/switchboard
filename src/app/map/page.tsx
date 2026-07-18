import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { toMapPoint, type MapMarker } from '@/lib/geo';
import { getMySharing } from '@/lib/actions/live-location';
import { MapExplorer } from './MapExplorer';

export const metadata: Metadata = { title: 'Map' };

/**
 * A single geographic map with toggleable overlays for the things that have a
 * real-world location: plans (events), serendipity zones, and shared places
 * (moments). Only rows carrying valid coordinates are plotted; the "Locate my
 * plans" control (see MapExplorer) fills those in from existing address text.
 */
export default async function MapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS scopes each query to what the viewer may see. We only pull rows that
  // already carry a coordinate, capped so the payload stays small. The viewer's
  // own live-sharing state (if any) seeds the "Share your location" control.
  const [{ data: events }, { data: zones }, { data: moments }, mySharing] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, starts_at, location_name, latitude, longitude')
      .not('latitude', 'is', null)
      .neq('status', 'cancelled')
      .limit(300),
    supabase
      .from('zones')
      .select('id, slug, name, latitude, longitude')
      .not('latitude', 'is', null)
      .limit(300),
    supabase
      .from('moments')
      .select('id, place_name, latitude, longitude')
      .not('latitude', 'is', null)
      .neq('status', 'closed')
      .limit(300),
    getMySharing(),
  ]);

  const markers: MapMarker[] = [];
  for (const event of events ?? []) {
    const point = toMapPoint(event.latitude, event.longitude);
    if (point) {
      markers.push({
        id: event.id,
        layer: 'plans',
        label: event.title,
        sub: event.location_name ?? undefined,
        lat: point.lat,
        lng: point.lng,
        href: `/events/${event.id}`,
      });
    }
  }
  for (const zone of zones ?? []) {
    const point = toMapPoint(zone.latitude, zone.longitude);
    if (point) {
      markers.push({
        id: zone.id,
        layer: 'zones',
        label: zone.name,
        lat: point.lat,
        lng: point.lng,
        href: `/zones/${zone.slug}`,
      });
    }
  }
  for (const moment of moments ?? []) {
    const point = toMapPoint(moment.latitude, moment.longitude);
    if (point) {
      markers.push({
        id: moment.id,
        layer: 'places',
        label: moment.place_name,
        lat: point.lat,
        lng: point.lng,
        href: '/moments',
      });
    }
  }

  return (
    <AppShell title="Map">
      <MapExplorer markers={markers} mySharing={mySharing} />
    </AppShell>
  );
}
