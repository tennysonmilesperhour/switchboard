import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { toMapPoint } from '@/lib/geo';
import { mapFocusHref } from '@/lib/map-directory';
import { ZoneCheckIn } from './ZoneCheckIn';
import { ZoneAccess } from './ZoneAccess';
import { ZoneJoinRequest } from './ZoneJoinRequest';

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

  // RLS decides this: a private zone the viewer isn't part of simply isn't
  // here, so the page needs no visibility check of its own. What it does need
  // is to tell the difference between "no such zone" and "a zone you can ask to
  // join" — hence the second, id-only lookup through the definer helper below.
  const { data: zone } = await supabase
    .from('zones')
    .select(
      'id, slug, name, description, experiences, latitude, longitude, visibility, organizer_id',
    )
    .eq('slug', slug)
    .maybeSingle();

  if (!zone) {
    // Private and not yours: offer the front door rather than a 404, but only
    // when a zone by that slug genuinely exists. `find_private_zone_by_slug`
    // returns nothing but the id and name, so this can't be used to enumerate.
    const { data: knockable } = await supabase.rpc('find_private_zone_by_slug', {
      p_slug: slug,
    });
    const row = Array.isArray(knockable) ? knockable[0] : null;
    if (!row) notFound();
    return (
      <AppShell title={row.name} back="/zones">
        <ZoneJoinRequest
          zoneId={row.id}
          zoneName={row.name}
          alreadyAsked={row.request_pending}
        />
      </AppShell>
    );
  }

  const point = toMapPoint(zone.latitude, zone.longitude);
  const canManage = await supabase
    .rpc('is_current_user_zone_moderator', { p_zone: zone.id })
    .then(({ data }) => data === true);

  // Only fetched for someone who can act on them; RLS returns nothing to
  // anyone else regardless.
  const [{ data: memberRows }, { data: requestRows }] = canManage
    ? await Promise.all([
        supabase
          .from('zone_members')
          .select('member_id, role, profile:profiles(display_name)')
          .eq('zone_id', zone.id),
        supabase
          .from('zone_join_requests')
          .select('id, requester_id, note, profile:profiles(display_name)')
          .eq('zone_id', zone.id)
          .eq('status', 'pending'),
      ])
    : [{ data: null }, { data: null }];

  function nameOf(row: { profile: unknown }): string {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return (profile as { display_name?: string } | null)?.display_name ?? 'Someone';
  }

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
            {zone.visibility === 'private' ? 'Private zone' : 'Zone'}
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
                : 'Be the first to check in. Every chance encounter starts somewhere.'}
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

        {canManage && (
          <ZoneAccess
            zoneId={zone.id}
            visibility={zone.visibility === 'private' ? 'private' : 'public'}
            organizerId={zone.organizer_id}
            members={(memberRows ?? []).map((row) => ({
              member_id: row.member_id,
              role: row.role,
              display_name: nameOf(row),
            }))}
            requests={(requestRows ?? []).map((row) => ({
              id: row.id,
              requester_id: row.requester_id,
              note: row.note,
              display_name: nameOf(row),
            }))}
          />
        )}
      </div>
    </AppShell>
  );
}
