import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
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
    .select('id, slug, name, description, experiences')
    .eq('slug', slug)
    .maybeSingle();
  if (!zone) notFound();

  const { count: checkedIn } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('zone_id', zone.id)
    .eq('status', 'open')
    .gt('available_until', new Date().toISOString());

  return (
    <AppShell title={zone.name} back="/zones">
      <div className="space-y-6">
        <div className="rounded-card bg-ink text-paper p-6">
          <p className="text-xs uppercase tracking-widest text-gold">
            Serendipity Zone
          </p>
          <h2 className="font-display text-3xl mt-1.5">✨ {zone.name}</h2>
          {zone.description && (
            <p className="text-sm opacity-70 mt-2 leading-relaxed">{zone.description}</p>
          )}
          <p className="text-sm opacity-70 mt-3">
            {(checkedIn ?? 0) > 0
              ? `${checkedIn} ${checkedIn === 1 ? 'person is' : 'people are'} currently open to a shared moment here.`
              : 'Be the first to check in. Serendipity needs a starting point.'}
          </p>
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
