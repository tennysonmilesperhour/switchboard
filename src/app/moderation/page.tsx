import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModerationClient, type OpenReport } from './ModerationClient';

export const metadata: Metadata = { title: 'Moderation', robots: { index: false } };

export default async function ModerationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Gate: only appointed platform moderators. is_platform_moderator is a
  // security-definer check; the reports list is likewise definer-guarded, so a
  // non-moderator sees nothing even if they reach this URL.
  const { data: isModerator } = await supabase.rpc('is_platform_moderator', {
    p_user: user.id,
  });
  if (!isModerator) redirect('/');

  const { data: reports } = await supabase.rpc('list_open_reports');
  const openReports = (reports ?? []) as OpenReport[];

  return (
    <AppShell title="Moderation" back="/settings">
      <div className="space-y-5">
        <p className="text-sm text-ink-soft leading-relaxed -mt-1">
          Open reports from the community. Resolving a report records who handled
          it and when; dismissing marks it reviewed with no action.
        </p>
        {openReports.length === 0 ? (
          <EmptyState
            emoji="✅"
            title="No open reports"
            body="Nothing needs review right now."
          />
        ) : (
          <ModerationClient reports={openReports} />
        )}
      </div>
    </AppShell>
  );
}
