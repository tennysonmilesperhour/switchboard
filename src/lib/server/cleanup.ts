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
}> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: signals } = await admin
    .from('availability_signals')
    .delete()
    .lt('expires_at', now)
    .select('id');

  const { data: moments } = await admin
    .from('moments')
    .update({ status: 'closed' })
    .eq('status', 'open')
    .lt('available_until', now)
    .select('id');

  return {
    signalsDeleted: signals?.length ?? 0,
    momentsClosed: moments?.length ?? 0,
  };
}
