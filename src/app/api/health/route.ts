import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { smsEnabled } from '@/lib/server/sms';
import { bearerMatches } from '@/lib/server/secret';

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
  if (checks.supabaseAdmin) {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    database = !error;

    // Account creation writes `handle` and `contact_email` onto `profiles`.
    // A database missing the profile_rich migration (e.g. a duplicate/rewired
    // project after a deployment switch) breaks signup while login keeps
    // working — so probe those columns explicitly to surface the drift here
    // instead of only at signup time.
    const { error: schemaError } = await admin
      .from('profiles')
      .select('id, handle, contact_email', { head: true })
      .limit(1);
    schema = !schemaError;
  }

  const required =
    checks.supabasePublic && checks.supabaseAdmin && checks.appUrl && checks.cron && database && schema;

  // Which database and origin THIS deployment is wired to. Compare across
  // deployments (and against where an invite actually lives) to catch a
  // read/write split: if the host app and the guest RSVP link report different
  // supabaseRef values, they're talking to different databases.
  const config = {
    supabaseRef: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  };

  return NextResponse.json(
    { ok: required, database, schema, services: checks, config },
    {
      status: required ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
