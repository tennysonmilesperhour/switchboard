import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Retention sweep for ephemeral rows that are otherwise only ever filtered by
 * time at read. Runs on the same cron as the cascade/poll/reminder sweeps.
 * Conservative by design: it removes availability signals that have already
 * expired (they carry no dependents) and closes moments whose availability
 * window has passed but were left 'open'. Returns a per-table count for the
 * cron run summary.
 */
export async function sweepExpired(): Promise<{
  signalsDeleted: number;
  momentsClosed: number;
  liveLocationsDeleted: number;
  exactLocationsDeleted: number;
  contactVerificationRequestsDeleted: number;
  rateLimitsDeleted: number;
  notificationsDeleted: number;
  momentsDeleted: number;
}> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // The durable retention rules live in one service-role-only database
  // function so their exact scope can be exercised by pgTAP. Run it before
  // closing newly-expired moments: a moment must already be closed when the
  // retention sweep begins before it is eligible for deletion.
  const { data: retention, error: retentionError } = await admin
    .rpc('sweep_retention')
    .single<{
      contact_verification_requests_deleted: number;
      rate_limits_deleted: number;
      notifications_deleted: number;
      moments_deleted: number;
    }>();
  if (retentionError) {
    throw new Error('Retention sweep failed', { cause: retentionError });
  }

  const [signalsResult, momentsResult, liveResult, exactResult] = await Promise.all([
    admin
      .from('availability_signals')
      .delete()
      .lt('expires_at', now)
      .select('id'),
    admin
      .from('moments')
      .update({ status: 'closed' })
      .eq('status', 'open')
      .lt('available_until', now)
      .select('id'),
    // Live locations are already ignored at read time once past expires_at;
    // this reclaims the row so a lapsed share leaves nothing behind.
    admin
      .from('live_locations')
      .delete()
      .lt('expires_at', now)
      .select('user_id'),
    // Exact points shared between two matched people. Precise data, so it goes
    // as soon as the window ends rather than waiting for the next share.
    admin
      .from('room_exact_locations')
      .delete()
      .lt('expires_at', now)
      .select('user_id'),
  ]);

  const cleanupError =
    signalsResult.error ?? momentsResult.error ?? liveResult.error ?? exactResult.error;
  if (cleanupError) {
    throw new Error('Ephemeral cleanup failed', { cause: cleanupError });
  }

  return {
    signalsDeleted: signalsResult.data?.length ?? 0,
    momentsClosed: momentsResult.data?.length ?? 0,
    liveLocationsDeleted: liveResult.data?.length ?? 0,
    exactLocationsDeleted: exactResult.data?.length ?? 0,
    contactVerificationRequestsDeleted:
      retention.contact_verification_requests_deleted,
    rateLimitsDeleted: retention.rate_limits_deleted,
    notificationsDeleted: retention.notifications_deleted,
    momentsDeleted: retention.moments_deleted,
  };
}
