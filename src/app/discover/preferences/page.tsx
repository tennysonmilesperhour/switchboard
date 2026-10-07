import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { errorFor } from '@/lib/errors';
import { reportOperationalError } from '@/lib/server/observability';
import { loadDiscoveryPrefs, type DiscoveryPrefs } from '@/lib/server/discovery-prefs';
import { isSelf, type Self } from '@/lib/discovery-lanes';
import { PreferencesClient } from './PreferencesClient';

export const metadata: Metadata = { title: 'Discovery settings' };

export default async function DiscoveryPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ lane?: string | string[] }>;
}) {
  const { lane } = await searchParams;
  const laneParam = Array.isArray(lane) ? lane[0] : lane;
  const initialSelf: Self = isSelf(laneParam) ? laneParam : 'friends';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // A failed read must not render as defaults: the next Save would write them
  // over what the person had.
  let prefs: DiscoveryPrefs | null = null;
  try {
    prefs = await loadDiscoveryPrefs(supabase, user.id);
  } catch (error) {
    await reportOperationalError('discovery-prefs.load', error, {}, 'SB-DISCOVERY-LOAD');
  }

  return (
    <AppShell title="Discovery settings" back="/discover">
      {prefs ? (
        <PreferencesClient prefs={prefs} initialSelf={initialSelf} />
      ) : (
        <Card>
          <ErrorNotice
            message={errorFor('SB-DISCOVERY-LOAD').message}
            fix={errorFor('SB-DISCOVERY-LOAD').fix}
            code="SB-DISCOVERY-LOAD"
          />
        </Card>
      )}
    </AppShell>
  );
}
