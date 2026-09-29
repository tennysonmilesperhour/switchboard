import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { signRoomPhotos } from '@/lib/server/room-media';
import { ModerationClient, type OpenReport } from './ModerationClient';
import { PendingVenuesClient, type PendingVenue } from './PendingVenuesClient';
import { SuspendedAccountsClient, type SuspendedAccount } from './SuspendedAccountsClient';

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

  const [
    { data: reports, error: reportsError },
    { data: venues, error: venuesError },
    { data: suspended, error: suspendedError },
  ] = await Promise.all([
    supabase.rpc('list_open_reports'),
    supabase.rpc('list_pending_venues'),
    supabase.rpc('list_suspended_accounts'),
  ]);
  // A queue that failed to load must not read as an empty one: "Nothing to
  // review" over a broken RPC tells a moderator everything is handled. Throw
  // to the error boundary, which shows the digest and logs the cause.
  const loadError = reportsError ?? venuesError ?? suspendedError;
  if (loadError) {
    throw new Error(`Could not load the moderation queue: ${loadError.message ?? 'unknown error'}`);
  }

  // A reported room photo is a private-bucket path. Sign it here, after the
  // moderator gate above and the one inside list_open_reports, and hand the
  // browser only the short-lived URL, never the stored path
  // (docs/SECURITY.md, "Media privacy").
  const rows = reports ?? [];
  const signed = await signRoomPhotos(
    rows
      .filter((row) => row.target_kind === 'room_message')
      .map((row) => ({ key: row.id, ref: row.target_image, ownerId: row.reported_id })),
  );
  const openReports: OpenReport[] = rows.map(({ target_image, ...row }) => ({
    ...row,
    target_had_image: Boolean(target_image),
    target_image_src: signed.get(row.id) ?? null,
  }));
  const pendingVenues: PendingVenue[] = venues ?? [];
  const suspendedAccounts: SuspendedAccount[] = suspended ?? [];

  const nothingToReview =
    openReports.length === 0 && pendingVenues.length === 0 && suspendedAccounts.length === 0;

  return (
    <AppShell title="Moderation" back="/settings">
      <div className="space-y-8">
        {nothingToReview ? (
          <EmptyState
            emoji="✅"
            title="Nothing to review"
            body="No open reports, venue claims or suspended accounts right now."
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
                  Open reports from the community, with the post or message that was
                  flagged. You can take it down or suspend the account, then mark the
                  report actioned; dismissing marks it reviewed with no action. Every
                  step records who took it and when.
                </p>
              </div>
              {openReports.length === 0 ? (
                <p className="text-sm text-ink-faint">No open reports.</p>
              ) : (
                <ModerationClient reports={openReports} />
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl text-ink">Suspended accounts</h2>
                <p className="text-sm text-ink-faint mt-0.5 leading-relaxed">
                  Everyone suspended right now. They are signed out, and signing in
                  tells them the account is suspended and where to write if they think
                  it&apos;s a mistake. Lift a suspension here when an appeal holds up.
                </p>
              </div>
              {suspendedAccounts.length === 0 ? (
                <p className="text-sm text-ink-faint">Nobody is suspended.</p>
              ) : (
                <SuspendedAccountsClient accounts={suspendedAccounts} />
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
