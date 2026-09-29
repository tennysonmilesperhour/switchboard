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

  // The self-scoped gate binds the subject to auth.uid(), so callers cannot
  // probe another account's moderator role.
  const { data: isModerator } = await supabase.rpc(
    'is_current_user_platform_moderator',
  );
  if (!isModerator) redirect('/');

  const [{ data: reports, error: reportsError }, { data: venues, error: venuesError }] =
    await Promise.all([
      supabase.rpc('list_open_reports'),
      supabase.rpc('list_pending_venues'),
    ]);
  // A queue that failed to load must not read as an empty one: "Nothing to
  // review" over a broken RPC tells a moderator everything is handled. Throw
  // to the error boundary, which shows the digest and logs the cause.
  if (reportsError || venuesError) {
    throw new Error(
      `Could not load the moderation queue: ${(reportsError ?? venuesError)?.message ?? 'unknown error'}`,
    );
  }
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
