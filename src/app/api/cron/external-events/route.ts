import { NextResponse } from 'next/server';
import { collectExternalEvents } from '@/lib/server/external-event-collector';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { bearerMatches } from '@/lib/server/secret';
import { describeError } from '@/lib/server/observability';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await checkRateLimit('cron:external-events', 3, 60 * 60))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const admin = createAdminClient();
    const lease = await admin.rpc('try_claim_external_event_collection', { p_lease_seconds: 240 });
    if (lease.error) throw lease.error;
    if (!lease.data) return NextResponse.json({ ok: true, skipped: 'overlap' });
    const summary = await collectExternalEvents();
    const finish = await admin.rpc('finish_external_event_collection', { p_counts: summary as unknown as Json });
    if (finish.error) throw finish.error;
    console.info(JSON.stringify({ level: 'info', area: 'cron.external-events', summary, at: new Date().toISOString() }));
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', area: 'cron.external-events', error: describeError(error), at: new Date().toISOString() }));
    return NextResponse.json({ error: 'Event collection failed' }, { status: 500 });
  }
}
