import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { AroundTabs } from '@/components/around/AroundTabs';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { distanceMeters, formatDistance, toMapPoint, type MapPoint } from '@/lib/geo';
import { createZone } from '@/lib/actions/zones';
import { EXPERIENCE_PRESETS } from '@/lib/types';
import { ZoneLocationField } from './ZoneLocationField';
import { errorFor, errorRef } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { reportOperationalError } from '@/lib/server/observability';
import {
  defaultZoneEnd,
  ilikeTerm,
  ZONE_NEAR_ME_METERS,
  zoneIsActive,
} from '@/lib/zone-rules';

export const metadata: Metadata = { title: 'Zones' };

const ERRORS: Record<string, string> = {
  name: 'Zones need a name of at least 3 letters.',
  taken: 'That zone name is taken. Try another.',
  end: 'Pick an end date between today and a year from now.',
  save: 'Could not create the zone. Try again.',
};

const ZONE_COLUMNS =
  'id, slug, name, description, organizer_id, latitude, longitude, visibility, ends_at';

interface ZoneRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  organizer_id: string;
  latitude: number | null;
  longitude: number | null;
  visibility: string;
  ends_at: string;
}

/** Degrees of latitude/longitude that cover `meters` around a point. */
function boundingBox(point: MapPoint, meters: number) {
  const dLat = meters / 111_320;
  const cos = Math.max(Math.cos((point.lat * Math.PI) / 180), 0.01);
  const dLng = meters / (111_320 * cos);
  return {
    minLat: point.lat - dLat,
    maxLat: point.lat + dLat,
    minLng: point.lng - dLng,
    maxLng: point.lng + dLng,
  };
}

/**
 * Zones are found by what you are looking for or where you are (D23), never by
 * "the 20 newest anywhere", which is what this page used to call "Active
 * zones": a festival that ended in July on another continent sat above the one
 * down the street. Private zones still reach only their members — every query
 * here goes through RLS.
 */
export default async function ZonesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string | string[] }>;
}) {
  const { error, q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const query = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 60) ?? '';
  const term = ilikeTerm(query);
  const nowIso = new Date().toISOString();

  // Where the viewer is, from what they have chosen to share with Switchboard:
  // a live share, or the home area on their profile. Neither leaves the server.
  const [{ data: live }, { data: home }] = await Promise.all([
    supabase
      .from('live_locations')
      .select('latitude, longitude')
      .eq('user_id', user.id)
      .gt('expires_at', nowIso)
      .maybeSingle(),
    supabase.rpc('my_home_point').maybeSingle<{ latitude: number; longitude: number }>(),
  ]);
  const here: MapPoint | null =
    toMapPoint(live?.latitude, live?.longitude) ?? toMapPoint(home?.latitude, home?.longitude);
  const hereSource = live ? 'your live location' : 'your home area';

  const [organized, memberships, nameMatches, descriptionMatches, nearby] = await Promise.all([
    supabase
      .from('zones')
      .select(ZONE_COLUMNS)
      .eq('organizer_id', user.id)
      .order('ends_at', { ascending: false })
      .limit(20),
    supabase.from('zone_members').select('zone_id').eq('member_id', user.id).limit(50),
    term
      ? supabase
          .from('zones')
          .select(ZONE_COLUMNS)
          .gt('ends_at', nowIso)
          .ilike('name', `%${term}%`)
          .order('ends_at', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] as ZoneRow[], error: null }),
    term
      ? supabase
          .from('zones')
          .select(ZONE_COLUMNS)
          .gt('ends_at', nowIso)
          .ilike('description', `%${term}%`)
          .order('ends_at', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] as ZoneRow[], error: null }),
    here
      ? (() => {
          const box = boundingBox(here, ZONE_NEAR_ME_METERS);
          return supabase
            .from('zones')
            .select(ZONE_COLUMNS)
            .gt('ends_at', nowIso)
            .gte('latitude', box.minLat)
            .lte('latitude', box.maxLat)
            .gte('longitude', box.minLng)
            .lte('longitude', box.maxLng)
            .limit(100);
        })()
      : Promise.resolve({ data: [] as ZoneRow[], error: null }),
  ]);

  const memberZoneIds = (memberships.data ?? []).map((row) => row.zone_id);
  const joined = memberZoneIds.length
    ? await supabase
        .from('zones')
        .select(ZONE_COLUMNS)
        .in('id', memberZoneIds)
        .order('ends_at', { ascending: false })
    : { data: [] as ZoneRow[], error: null };

  const loadError =
    organized.error ??
    memberships.error ??
    nameMatches.error ??
    descriptionMatches.error ??
    nearby.error ??
    joined.error;
  if (loadError) {
    await reportOperationalError('zones.load', loadError, {}, 'SB-ZONE-LOAD');
  }

  const mine = new Map<string, ZoneRow>();
  for (const zone of [...(organized.data ?? []), ...(joined.data ?? [])]) mine.set(zone.id, zone);
  const yourZones = [...mine.values()].sort((a, b) => b.ends_at.localeCompare(a.ends_at));

  const found = new Map<string, ZoneRow>();
  for (const zone of [...(nameMatches.data ?? []), ...(descriptionMatches.data ?? [])]) {
    found.set(zone.id, zone);
  }
  const results = [...found.values()].slice(0, 20);

  const near = here
    ? (nearby.data ?? [])
        .map((zone) => {
          const point = toMapPoint(zone.latitude, zone.longitude);
          return { zone, meters: point ? distanceMeters(here, point) : Number.NaN };
        })
        .filter(({ meters }) => Number.isFinite(meters) && meters <= ZONE_NEAR_ME_METERS)
        .sort((a, b) => a.meters - b.meters)
        .slice(0, 20)
    : [];

  const defaultEndDay = defaultZoneEnd().slice(0, 10);
  const failure = loadError ? errorFor('SB-ZONE-LOAD') : null;

  return (
    <AppShell title="Around">
      <div className="space-y-7">
        <AroundTabs active="zones" />
        <p className="text-sm text-ink-soft leading-relaxed -mt-1">
          A <strong>zone</strong> is a place — a conference, cruise, campus,
          festival, or any gathering. A <strong>moment</strong> is you checking
          in, so people in the same zone can serendipitously find each other.
          Anchor a zone to a spot and it appears on the{' '}
          <Link href="/map" className="font-semibold text-terracotta-deep underline">
            map
          </Link>
          .
        </p>

        {failure && (
          <Card tone="cream">
            <ErrorNotice message={failure.message} fix={failure.fix} code="SB-ZONE-LOAD" />
          </Card>
        )}

        <section>
          <SectionHeader title="Find a zone" />
          <form action="/zones" method="get" role="search" className="flex gap-2">
            <input
              name="q"
              type="search"
              defaultValue={query}
              maxLength={60}
              placeholder="Search by name — DevCon, Deck 4, Spring Fair…"
              aria-label="Search zones"
              className="min-w-0 flex-1 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>
          {term && (
            <div className="mt-3 space-y-2">
              {results.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  No open zone matches “{query}”. Private zones only show up for their members.
                </p>
              ) : (
                results.map((zone) => <ZoneCard key={zone.id} zone={zone} />)
              )}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="Near you" hint={here ? `Within 50 km of ${hereSource}` : undefined} />
          {here ? (
            near.length > 0 ? (
              <div className="space-y-2">
                {near.map(({ zone, meters }) => (
                  <ZoneCard key={zone.id} zone={zone} distance={formatDistance(meters)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">
                No open zones are pinned within 50 km of {hereSource} right now.
              </p>
            )
          ) : (
            <Card tone="cream">
              <p className="text-sm text-ink-soft leading-relaxed">
                To see zones near you, add your home area on{' '}
                <Link href="/profile/edit" className="font-semibold text-terracotta-deep underline">
                  your profile
                </Link>{' '}
                or share your location on the{' '}
                <Link href="/map" className="font-semibold text-terracotta-deep underline">
                  map
                </Link>
                . Switchboard only uses a place you’ve chosen to give it.
              </p>
            </Card>
          )}
        </section>

        {!failure && yourZones.length === 0 && (
          <Card tone="cream">
            <p className="text-sm text-ink-soft leading-relaxed">
              A zone is a shared place where people can privately check in and
              discover who else is there. Join one from a link when an organizer
              invites you, find an open one above, or create one below for a
              conference, trip, campus, or gathering you run.
            </p>
          </Card>
        )}

        {yourZones.length > 0 && (
          <section>
            <SectionHeader title="Your zones" hint="Ones you run or were let into" />
            <div className="space-y-2">
              {yourZones.map((zone) => (
                <ZoneCard key={zone.id} zone={zone} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader
            title="Create a zone"
            hint="For organizers: icebreakers that actually work"
          />
          {error && (
            <p role="alert" className="mb-3 rounded-card bg-rose-soft text-rose-deep text-sm p-3">
              {ERRORS[error] ?? 'Something went wrong.'}
              {error === 'save' && (
                <span className="ml-2 text-xs opacity-70">{errorRef('SB-ZONE-SAVE')}</span>
              )}
            </p>
          )}
          <form action={createZone}>
            <Card>
              <div className="space-y-2.5">
                <input
                  name="name"
                  required
                  placeholder="Zone name (DevCon 2026, Deck 4 Lounge…)"
                  aria-label="Zone name"
                  className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                />
                <input
                  name="description"
                  placeholder="One line about it (optional)"
                  aria-label="Zone description"
                  className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                />
                <ZoneLocationField className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta" />
                <label className="block space-y-1.5">
                  <span className="text-xs text-ink-faint">
                    Ends on <span className="text-ink-faint">(a week from today unless you change it)</span>
                  </span>
                  <input
                    type="date"
                    name="ends_on"
                    defaultValue={defaultEndDay}
                    className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                  />
                </label>
                <fieldset>
                  <legend className="text-xs text-ink-faint mb-1.5">
                    Who can find this zone
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        value: 'public',
                        label: '🌍 Anyone',
                        hint: 'A conference, festival, or campus',
                      },
                      {
                        value: 'private',
                        label: '🔒 Only people I let in',
                        hint: 'A trip, an offsite, a small group',
                      },
                    ].map((option, index) => (
                      <label
                        key={option.value}
                        title={option.hint}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-paper px-2.5 py-1.5 text-xs cursor-pointer has-checked:bg-ink has-checked:text-paper has-checked:border-ink"
                      >
                        <input
                          type="radio"
                          name="visibility"
                          value={option.value}
                          defaultChecked={index === 0}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-xs text-ink-faint mb-1.5">
                    Curated experiences for this zone
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPERIENCE_PRESETS.map((experience) => (
                      <label
                        key={experience.label}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-paper px-2.5 py-1.5 text-xs cursor-pointer has-checked:bg-ink has-checked:text-paper has-checked:border-ink"
                      >
                        <input
                          type="checkbox"
                          name="experiences"
                          value={experience.label}
                          className="sr-only"
                        />
                        {experience.emoji} {experience.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit" size="sm" className="w-full">
                  Create zone
                </Button>
              </div>
            </Card>
          </form>
        </section>
      </div>
    </AppShell>
  );
}

function ZoneCard({ zone, distance }: { zone: ZoneRow; distance?: string }) {
  const active = zoneIsActive(zone.ends_at);
  return (
    <Link href={`/zones/${zone.slug}`} className="block group">
      <Card className="group-hover:border-terracotta transition-colors">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold">
            {zone.visibility === 'private' ? '🔒' : '✨'} {zone.name}
          </p>
          {distance && (
            <span className="shrink-0 text-xs font-semibold text-ink-faint">{distance}</span>
          )}
        </div>
        {zone.description && <p className="text-sm text-ink-soft mt-0.5">{zone.description}</p>}
        {/* Whether a zone is anchored decides whether it can ever be found on
            the map or near anyone, so say it rather than leaving it implied. */}
        <p className="text-xs text-ink-faint mt-1">
          {active ? `Open until ${formatDate(zone.ends_at)}` : `Ended ${formatDate(zone.ends_at)}`}
          {' · '}
          {toMapPoint(zone.latitude, zone.longitude) ? '📍 On the map' : 'Not on the map yet'}
        </p>
      </Card>
    </Link>
  );
}
