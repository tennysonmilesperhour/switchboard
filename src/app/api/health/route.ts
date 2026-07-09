import { NextResponse } from 'next/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';

export async function GET() {
  const checks = {
    supabasePublic: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    supabaseAdmin: hasAdminCredentials(),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    cron: Boolean(process.env.CRON_SECRET),
    email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    push: Boolean(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY,
    ),
  };

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
  return NextResponse.json(
    { ok: required, database, schema, services: checks },
    {
      status: required ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
