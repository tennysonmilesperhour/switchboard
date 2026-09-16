import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Passport } from '@/components/features/Passport';
import { loadPassport } from '@/lib/server/passport';
import { passportByGroup } from '@/lib/passport';
import { FeatureIndexClient } from './FeatureIndexClient';

export const metadata: Metadata = {
  title: 'Everything Switchboard does',
  description:
    'An index of every Switchboard feature and where to find it.',
};

/**
 * The feature index. Switchboard reveals itself a surface at a time, which
 * keeps it calm and means most people never meet half of it; this page is the
 * one place that lays it all out, with directions.
 *
 * The catalogue itself is the same for everyone. What is personal is the
 * passport — which of these you've actually tried — derived from what already
 * happened, read through the viewer's own client, and shown to nobody else.
 */
export default async function FeaturesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy keeps signed-out visitors off /features, but the page shouldn't
  // fall over if that ever changes: no session simply means no passport.
  const passport = user ? await loadPassport(user.id) : null;

  return (
    <AppShell title="Everything" back="/">
      <div className="space-y-6">
        <p className="text-plate text-plate-inset text-sm leading-relaxed text-ink-soft">
          Switchboard shows you one thing at a time on purpose. Here’s the whole
          of it — what each part does, and where to find it.
        </p>
        {passport && <Passport state={passport} />}
        <FeatureIndexClient
          groupProgress={passport ? passportByGroup(passport) : null}
        />
      </div>
    </AppShell>
  );
}
