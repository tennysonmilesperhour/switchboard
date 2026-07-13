import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { createZone } from '@/lib/actions/zones';
import { EXPERIENCE_PRESETS } from '@/lib/types';

export const metadata: Metadata = { title: 'Serendipity Zones' };

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
    .select('id, slug, name, description, organizer_id')
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <AppShell title="Zones" back="/moments">
      <div className="space-y-7">
        <p className="text-sm text-ink-soft leading-relaxed -mt-1">
          A zone is a Shared Moments space for a conference, cruise, campus,
          festival, or any gathering. Everyone who checks in through the zone
          link can serendipitously find each other.
        </p>

        {(zones?.length ?? 0) === 0 && (
          <Card tone="cream">
            <p className="text-sm text-ink-soft leading-relaxed">
              No zones yet. Running a conference, trip, or gathering? Create one
              below and share the link so everyone can find each other.
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
                    <p className="font-bold">✨ {zone.name}</p>
                    {zone.description && (
                      <p className="text-sm text-ink-soft mt-0.5">{zone.description}</p>
                    )}
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
