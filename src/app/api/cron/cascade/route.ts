import { NextResponse } from 'next/server';
import { sweepCascades } from '@/lib/server/cascade-runner';
import { sweepDuePolls } from '@/lib/server/poll-runner';

/**
 * Vercel cron (see vercel.json): advances every live cascade and resolves
 * polls whose deadlines passed. Lazy advancement on page load is the
 * low-latency path; this is the guarantee.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [eventsAdvanced, pollsResolved] = await Promise.all([
    sweepCascades(),
    sweepDuePolls(),
  ]);
  return NextResponse.json({ ok: true, eventsAdvanced, pollsResolved });
}
