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
  if (checks.supabaseAdmin) {
    const { error } = await createAdminClient()
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    database = !error;
  }

  const required = checks.supabasePublic && checks.supabaseAdmin && checks.appUrl && checks.cron && database;
  return NextResponse.json(
    { ok: required, database, services: checks },
    {
      status: required ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
