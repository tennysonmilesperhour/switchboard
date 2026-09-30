import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { AroundTabs } from '@/components/around/AroundTabs';
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
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  // `?focus=<layer>:<id>` opens the map already centred on one pin — how the
  // zone, plan, and place surfaces answer "where is this?" without each of them
  // growing a map of its own.
  const { focus } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS scopes each query to what the viewer may see. We only pull rows that
  // already carry a coordinate, capped so the payload stays small. The viewer's
  // own live-sharing state (if any) seeds the "Share your location" control.
  //
  // The Plans layer is what's coming up (D24): a plan still ahead of us, one
  // under way (started in the last few hours, or not yet past its end), or one
  // whose date is still being decided. It used to be any plan the viewer could
  // read, in no order — last year's dinners and invitations they had turned
  // down included, and the 300 cap could cut next week's plan for them.
  const now = new Date();
  const nowIso = now.toISOString();
  const recentStart = new Date(now.getTime() - 6 * 3_600_000).toISOString();
  const [{ data: events }, { data: zones }, { data: moments }, { data: myInvites }, mySharing] =
    await Promise.all([
      supabase
        .from('events')
        .select('id, title, starts_at, location_name, latitude, longitude')
        .not('latitude', 'is', null)
        .neq('status', 'cancelled')
        .or(`starts_at.is.null,starts_at.gte.${recentStart},ends_at.gt.${nowIso}`)
        .order('starts_at', { ascending: true, nullsFirst: false })
        .limit(300),
      supabase
        .from('zones')
        .select('id, slug, name, latitude, longitude')
        .not('latitude', 'is', null)
        // An ended zone is not somewhere anyone can check in any more.
        .gt('ends_at', nowIso)
        .limit(300),
      supabase
        .from('moments')
        .select('id, place_name, latitude, longitude')
        .eq('user_id', user.id)
        .not('latitude', 'is', null)
        .neq('status', 'closed')
        .gt('available_until', nowIso)
        .limit(300),
      // Plans the viewer said no to (or that moved on without them) are not
      // plans they're going to; RLS still lets them read the row.
      supabase
        .from('invites')
        .select('event_id')
        .eq('invitee_id', user.id)
        .in('status', ['declined', 'expired', 'cancelled']),
      getMySharing(),
    ]);
  const notGoing = new Set((myInvites ?? []).map((invite) => invite.event_id));

  const markers: MapMarker[] = [];
  for (const event of events ?? []) {
    if (notGoing.has(event.id)) continue;
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
    <AppShell title="Around">
      <div className="space-y-4">
        <AroundTabs active="map" />
        <MapExplorer markers={markers} mySharing={mySharing} initialFocus={focus ?? null} />
      </div>
    </AppShell>
  );
}
