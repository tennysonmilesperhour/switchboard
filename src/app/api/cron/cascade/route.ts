import { NextResponse } from 'next/server';
import { sweepCascades } from '@/lib/server/cascade-runner';
import { sweepDuePolls } from '@/lib/server/poll-runner';
import { sweepReminders } from '@/lib/server/reminders';

/**
 * Vercel cron (see vercel.json): advances every live cascade, resolves polls
 * whose deadlines passed, and fires any due event reminders. Lazy advancement
 * on page load is the low-latency path; this is the guarantee.
 */
export async function GET(request: Request) {
  // Fail closed: an unset secret must never leave the sweeps publicly invokable.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [eventsAdvanced, pollsResolved, remindersSent] = await Promise.all([
    sweepCascades(),
    sweepDuePolls(),
    sweepReminders(),
  ]);
  return NextResponse.json({
    ok: true,
    eventsAdvanced,
    pollsResolved,
    remindersSent,
  });
}
