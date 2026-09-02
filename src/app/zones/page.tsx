import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toMapPoint } from '@/lib/geo';
import { createZone } from '@/lib/actions/zones';
import { EXPERIENCE_PRESETS } from '@/lib/types';
import { ZoneLocationField } from './ZoneLocationField';

export const metadata: Metadata = { title: 'Zones' };

const ERRORS: Record<string, string> = {
  name: 'Zones need a name of at least 3 letters.',
  taken: 'That zone name is taken. Try another.',
  save: 'Could not create the zone. Try again.',
};

export default async function ZonesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: zones } = await supabase
    .from('zones')
    // Private zones the viewer isn't part of never come back — RLS decides,
    // so this list needed no filtering of its own.
    .select('id, slug, name, description, organizer_id, latitude, longitude, visibility')
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <AppShell title="Zones" back="/moments">
      <div className="space-y-7">
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

        {(zones?.length ?? 0) === 0 && (
          <Card tone="cream">
            <p className="text-sm text-ink-soft leading-relaxed">
              A zone is a shared place where people can privately check in and
              discover who else is there. Join one from a link when an organizer
              invites you, or create one below for a conference, trip, campus, or
              gathering you run.
            </p>
          </Card>
        )}

        {(zones?.length ?? 0) > 0 && (
          <section>
            <SectionHeader title="Active zones" />
            <div className="space-y-2">
              {zones?.map((zone) => (
                <Link key={zone.id} href={`/zones/${zone.slug}`} className="block group">
                  <Card className="group-hover:border-terracotta transition-colors">
                    <p className="font-bold">
                      {zone.visibility === 'private' ? '🔒' : '✨'} {zone.name}
                    </p>
                    {zone.description && (
                      <p className="text-sm text-ink-soft mt-0.5">{zone.description}</p>
                    )}
                    {/* Whether a zone is anchored decides whether it can ever be
                        found on the map, so say it here rather than leaving the
                        map's Zones count to be reverse-engineered. */}
                    <p className="text-xs text-ink-faint mt-1">
                      {toMapPoint(zone.latitude, zone.longitude)
                        ? '📍 On the map'
                        : 'No location yet — not on the map'}
                    </p>
                  </Card>
                </Link>
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
