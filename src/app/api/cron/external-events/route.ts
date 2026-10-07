import { NextResponse } from 'next/server';
import { collectExternalEvents } from '@/lib/server/external-event-collector';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { bearerMatches } from '@/lib/server/secret';
import { describeError } from '@/lib/server/observability';

export const maxDuration = 60;

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
    const summary = await collectExternalEvents();
    console.info(JSON.stringify({ level: 'info', area: 'cron.external-events', summary, at: new Date().toISOString() }));
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', area: 'cron.external-events', error: describeError(error), at: new Date().toISOString() }));
    return NextResponse.json({ error: 'Event collection failed' }, { status: 500 });
  }
}
