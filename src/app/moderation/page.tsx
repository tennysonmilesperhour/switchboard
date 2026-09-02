import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModerationClient, type OpenReport } from './ModerationClient';
import { PendingVenuesClient, type PendingVenue } from './PendingVenuesClient';

export const metadata: Metadata = { title: 'Moderation', robots: { index: false } };

export default async function ModerationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Gate: only appointed platform moderators. is_platform_moderator is a
  // security-definer check; the queues below are likewise definer-guarded, so a
  // non-moderator sees nothing even if they reach this URL.
  const { data: isModerator } = await supabase.rpc('is_platform_moderator', {
    p_user: user.id,
  });
  if (!isModerator) redirect('/');

  const [{ data: reports }, { data: venues }] = await Promise.all([
    supabase.rpc('list_open_reports'),
    supabase.rpc('list_pending_venues'),
  ]);
  const openReports: OpenReport[] = reports ?? [];
  const pendingVenues: PendingVenue[] = venues ?? [];

  const nothingToReview = openReports.length === 0 && pendingVenues.length === 0;

  return (
    <AppShell title="Moderation" back="/settings">
      <div className="space-y-8">
        {nothingToReview ? (
          <EmptyState
            emoji="✅"
            title="Nothing to review"
            body="No open reports or venue claims right now."
          />
        ) : (
          <>
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl text-ink">Venue claims</h2>
                <p className="text-sm text-ink-faint mt-0.5 leading-relaxed">
                  Verify a claim only if it plausibly comes from the business —
                  check the website and that the perk is real. A verified venue&apos;s
                  perk shows to any group meeting there, so it&apos;s a promise on the
                  business&apos;s behalf.
                </p>
              </div>
              {pendingVenues.length === 0 ? (
                <p className="text-sm text-ink-faint">No venue claims awaiting review.</p>
              ) : (
                <PendingVenuesClient venues={pendingVenues} />
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl text-ink">Reports</h2>
                <p className="text-sm text-ink-faint mt-0.5 leading-relaxed">
                  Open reports from the community. Resolving records who handled it
                  and when; dismissing marks it reviewed with no action.
                </p>
              </div>
              {openReports.length === 0 ? (
                <p className="text-sm text-ink-faint">No open reports.</p>
              ) : (
                <ModerationClient reports={openReports} />
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
