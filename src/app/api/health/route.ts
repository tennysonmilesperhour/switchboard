import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { smsEnabled } from '@/lib/server/sms';
import { bearerMatches } from '@/lib/server/secret';
import {
  CRON_HEARTBEAT_MAX_AGE_MS,
  getCronSweepStatus,
  isCronHeartbeatFresh,
} from '@/lib/server/cron-runtime';
import type { ErrorCode } from '@/lib/errors';
import {
  evaluateSchemaStatus,
  EXPECTED_SCHEMA_VERSION,
} from '@/lib/health';

const REQUIRED_PRIVATE_BUCKET = 'media-private';
const EVENT_COLLECTION_MAX_AGE_MS = 7 * 60 * 60 * 1000;

/**
 * The `<ref>` subdomain of a Supabase URL (`https://<ref>.supabase.co`) — the
 * project identifier. Non-secret: NEXT_PUBLIC_SUPABASE_URL already ships to the
 * browser. Surfacing it lets you confirm, per deployment, which database is
 * actually wired up — so a "host writes to project A, guest link reads project
 * B" split across multiple Supabase projects is visible in one request instead
 * of masquerading as an expired invite.
 */
function projectRef(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const checks = {
    supabasePublic: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    supabaseAdmin: hasAdminCredentials(),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    cron: Boolean(process.env.CRON_SECRET),
    email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    sms: smsEnabled(),
    phoneVerification: Boolean(
      process.env.CONTACT_VERIFICATION_SECRET && smsEnabled(),
    ),
    push: Boolean(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY,
    ),
  };

  // The per-service matrix, project ref, and the admin DB probe are operator
  // diagnostics, not public data: which integrations a deployment has wired up
  // is reconnaissance, and the probe runs two unauthenticated service-role
  // queries per hit. Gate all of it behind the CRON_SECRET the operator already
  // holds; anonymous callers get only a coarse liveness boolean (env presence,
  // no DB round-trip). Fail closed if the secret is unset.
  const authorized = bearerMatches(
    request.headers.get('authorization'),
    process.env.CRON_SECRET,
  );

  if (!authorized) {
    const envReady =
      checks.supabasePublic && checks.supabaseAdmin && checks.appUrl && checks.cron;
    return NextResponse.json(
      { ok: envReady },
      {
        status: envReady ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  let database = false;
  let schema = false;
  let schemaVersion: string | null = null;
  let missingSchemaObjects: string[] = [];
  let storage = false;
  let cronLastRunAt: string | null = null;
  let eventCollectionLastRunAt: string | null = null;
  if (checks.supabaseAdmin) {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    database = !error;

    const [
      { data: status, error: schemaError },
      { data: buckets, error: storageError },
      cronStatus,
      eventCollectionStatus,
    ] =
      await Promise.all([
        admin.rpc('app_schema_status'),
        admin.storage.listBuckets(),
        getCronSweepStatus('cascade', admin).catch((error) => {
          console.error('[health:cron-heartbeat]', error);
          return null;
        }),
        admin.rpc('external_event_collection_status'),
      ]);
    const schemaStatus = evaluateSchemaStatus(status, schemaError);
    schemaVersion = schemaStatus.current;
    missingSchemaObjects = schemaStatus.missing;
    schema = schemaStatus.healthy;
    storage =
      !storageError &&
      Boolean(buckets?.some((bucket) => bucket.id === REQUIRED_PRIVATE_BUCKET && !bucket.public));
    cronLastRunAt = cronStatus?.lastRunAt ?? null;
    const eventStatus = Array.isArray(eventCollectionStatus.data) ? eventCollectionStatus.data[0] : null;
    eventCollectionLastRunAt = eventStatus?.last_run_at ?? null;
    checks.cron = checks.cron && isCronHeartbeatFresh(cronLastRunAt);
    checks.cron = checks.cron && !eventCollectionStatus.error && Boolean(
      eventCollectionLastRunAt && Date.now() - Date.parse(eventCollectionLastRunAt) <= EVENT_COLLECTION_MAX_AGE_MS,
    );
  } else {
    checks.cron = false;
  }

  // Phone verification and SMS are now part of the launch contract.
  const required =
    checks.supabasePublic &&
    checks.supabaseAdmin &&
    checks.appUrl &&
    checks.cron &&
    checks.email &&
    checks.sms &&
    checks.phoneVerification &&
    process.env.SMS_PAUSED !== 'true' &&
    database &&
    schema &&
    storage;

  // Which database and origin THIS deployment is wired to. Compare across
  // deployments (and against where an invite actually lives) to catch a
  // read/write split: if the host app and the guest RSVP link report different
  // supabaseRef values, they're talking to different databases.
  const config = {
    supabaseRef: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    deploymentVersion:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
      process.env.NEXT_PUBLIC_APP_VERSION ??
      null,
  };

  // The same codes users are shown, for whatever is actually wrong here. A
  // deployment that fails this check produces the exact identifier its users
  // will be reading off their screens — so "several people report SB-CONFIG-DB"
  // and "health says SB-CONFIG-DB" are recognisably the same incident rather
  // than two unrelated reports.
  const problems: ErrorCode[] = [];
  if (!checks.supabaseAdmin || !database) problems.push('SB-CONFIG-DB');
  if (!checks.appUrl) problems.push('SB-CONFIG-ORIGIN');
  if (!checks.cron) problems.push('SB-CONFIG-CRON');
  if (!schema) problems.push('SB-CONFIG-SCHEMA');
  if (!storage) problems.push('SB-CONFIG-STORAGE');
  if (!checks.email) problems.push('SB-CONFIG-EMAIL');
  if (!checks.sms) problems.push('SB-CONFIG-SMS');
  if (!checks.push) problems.push('SB-CONFIG-PUSH');

  return NextResponse.json(
    {
      ok: required,
      problems,
      database,
      schema,
      schemaVersion,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      missingSchemaObjects,
      storage,
      services: checks,
      cronHeartbeat: {
        lastRunAt: cronLastRunAt,
        staleAfterSeconds: CRON_HEARTBEAT_MAX_AGE_MS / 1000,
      },
      eventCollectionHeartbeat: {
        lastRunAt: eventCollectionLastRunAt,
        staleAfterSeconds: EVENT_COLLECTION_MAX_AGE_MS / 1000,
      },
      config,
    },
    {
      status: required ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
