import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { toMapPoint } from '@/lib/geo';
import { mapFocusHref } from '@/lib/map-directory';
import { ZoneCheckIn } from './ZoneCheckIn';

export default async function ZonePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: zone } = await supabase
    .from('zones')
    .select('id, slug, name, description, experiences, latitude, longitude')
    .eq('slug', slug)
    .maybeSingle();
  if (!zone) notFound();
  const point = toMapPoint(zone.latitude, zone.longitude);

  // Two different questions, and only one of them can be asked of the table.
  // `moments` is owner-only under RLS, so a direct count here is always just the
  // reader's own check-ins — which is why this line used to claim "1 person is
  // currently open to a shared moment here" when that person was you, and "Be
  // the first to check in" with six other people standing in the zone. Everyone
  // else is counted by `zone_presence`, a definer RPC that returns a bare
  // integer and honours blocks (20260810120000_zone_presence.sql).
  const [{ data: othersHere }, { count: myCheckIns }] = await Promise.all([
    supabase.rpc('zone_presence', { p_zone: zone.id }),
    supabase
      .from('moments')
      .select('id', { count: 'exact', head: true })
      .eq('zone_id', zone.id)
      .eq('status', 'open')
      .gt('available_until', new Date().toISOString()),
  ]);
  const others = typeof othersHere === 'number' ? othersHere : 0;
  const imHere = (myCheckIns ?? 0) > 0;

  return (
    <AppShell title={zone.name} back="/zones">
      <div className="space-y-6">
        <div className="rounded-card bg-ink text-paper p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gold-deep">
            Serendipity Zone
          </p>
          <h2 className="font-extrabold tracking-tight text-3xl mt-1.5 text-balance">
            ✨ {zone.name}
          </h2>
          {zone.description && (
            <p className="text-sm opacity-70 mt-2 leading-relaxed">{zone.description}</p>
          )}
          <p className="text-sm opacity-70 mt-3">
            {others > 0
              ? `${others} ${others === 1 ? 'other person is' : 'other people are'} currently open to a shared moment here.${
                  imHere ? ' You’re checked in too.' : ''
                }`
              : imHere
                ? 'You’re checked in here. Nobody else is right now — you’re the one they’ll find.'
                : 'Be the first to check in. Serendipity needs a starting point.'}
          </p>
          {/* A zone is a place, so "where is it" has to be answerable from here.
              Anchored zones link straight to their own pin; unanchored ones say
              so, rather than leaving the map's Zones count unexplained. */}
          {point ? (
            <Link
              href={mapFocusHref('zones', zone.id)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-paper/15 px-3 py-1.5 text-xs font-bold text-paper underline underline-offset-2"
            >
              📍 Show this zone on the map
            </Link>
          ) : (
            <p className="mt-3 text-xs opacity-60">
              This zone isn’t anchored to a spot yet, so it doesn’t appear on the map.
            </p>
          )}
        </div>
        <ZoneCheckIn
          zoneId={zone.id}
          zoneName={zone.name}
          experiences={
            zone.experiences.length > 0
              ? zone.experiences
              : ['Coffee Conversation', 'Networking', 'Meet Someone New']
          }
        />
      </div>
    </AppShell>
  );
}
