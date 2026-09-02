import { createAdminClient } from '@/lib/supabase/admin';
import { describeError } from '@/lib/server/observability';

export const CRON_HEARTBEAT_MAX_AGE_MS = 5 * 60 * 1000;
const CRON_SWEEP_LEASE_SECONDS = 90;

export type CronSweep = 'cascade' | 'digest';
export type CronRunSummary = Record<string, boolean | number | string>;

export interface CronSweepStatus {
  lastStartedAt: string | null;
  lastRunAt: string | null;
  runningUntil: string | null;
  lastCounts: Record<string, unknown>;
}

type AdminClient = ReturnType<typeof createAdminClient>;

function cronRuntimeError(action: string, sweep: CronSweep, error: unknown): Error {
  const described = describeError(error);
  return new Error(`Could not ${action} ${sweep} cron state: ${described.message}`);
}

/** Claim the database-backed lease before any sweep work begins. */
export async function claimCronSweep(sweep: CronSweep): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc(
    'try_claim_operator_sweep',
    {
      p_sweep: sweep,
      p_lease_seconds: CRON_SWEEP_LEASE_SECONDS,
    },
  );
  if (error) throw cronRuntimeError('claim', sweep, error);
  return data === true;
}

/** Record a heartbeat only after every part of a sweep has completed. */
export async function finishCronSweep(
  sweep: CronSweep,
  summary: CronRunSummary,
): Promise<void> {
  const { error } = await createAdminClient().rpc('finish_operator_sweep', {
    p_sweep: sweep,
    p_counts: summary,
  });
  if (error) throw cronRuntimeError('finish', sweep, error);
}

/** Read the last successful run through the service-role-only status RPC. */
export async function getCronSweepStatus(
  sweep: CronSweep,
  admin: AdminClient = createAdminClient(),
): Promise<CronSweepStatus | null> {
  const { data, error } = await admin.rpc('operator_sweep_status', {
    p_sweep: sweep,
  });
  if (error) throw cronRuntimeError('read', sweep, error);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  const counts = value.last_counts;
  return {
    lastStartedAt:
      typeof value.last_started_at === 'string' ? value.last_started_at : null,
    lastRunAt: typeof value.last_run_at === 'string' ? value.last_run_at : null,
    runningUntil:
      typeof value.running_until === 'string' ? value.running_until : null,
    lastCounts:
      counts !== null && typeof counts === 'object' && !Array.isArray(counts)
        ? (counts as Record<string, unknown>)
        : {},
  };
}

export function isCronHeartbeatFresh(
  lastRunAt: string | null,
  nowMs = Date.now(),
): boolean {
  if (!lastRunAt) return false;
  const runMs = Date.parse(lastRunAt);
  return Number.isFinite(runMs) && nowMs - runMs <= CRON_HEARTBEAT_MAX_AGE_MS;
}

/** One structured line per invocation, suitable for a deployment log search. */
export function logCronSummary(
  sweep: CronSweep,
  summary: CronRunSummary,
  startedAtMs: number,
): void {
  console.info(JSON.stringify({
    level: 'info',
    area: `cron.${sweep}`,
    summary,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    at: new Date().toISOString(),
  }));
}

export function logCronFailure(
  sweep: CronSweep,
  error: unknown,
  startedAtMs: number,
): void {
  console.error(JSON.stringify({
    level: 'error',
    area: `cron.${sweep}`,
    error: describeError(error),
    durationMs: Math.max(0, Date.now() - startedAtMs),
    at: new Date().toISOString(),
  }));
}
