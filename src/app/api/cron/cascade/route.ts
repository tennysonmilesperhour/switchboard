import { sweepSmsJobs } from '@/lib/server/sms-jobs';
import { NextResponse } from 'next/server';
import { sweepCascades } from '@/lib/server/cascade-runner';
import { sweepDuePolls, sweepSuggestionDeadlines } from '@/lib/server/poll-runner';
import { sweepReminders } from '@/lib/server/reminders';
import { sweepExpired } from '@/lib/server/cleanup';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { bearerMatches } from '@/lib/server/secret';
import {
  claimCronSweep,
  finishCronSweep,
  logCronFailure,
  logCronSummary,
} from '@/lib/server/cron-runtime';

// Bound the function so a slow sweep fails loudly instead of being killed mid-run
// by the platform default. The sweeps scan all live events/polls each minute.
export const maxDuration = 60;

/**
 * Vercel cron (see vercel.json): advances every live cascade, resolves polls
 * whose deadlines passed, and fires any due event reminders. Lazy advancement
 * on page load is the low-latency path; this is the guarantee.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  // Fail closed: an unset secret must never leave the sweeps publicly invokable.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await checkRateLimit('cron:cascade', 5, 60))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (!(await claimCronSweep('cascade'))) {
    const summary = { ok: true, skipped: 'overlap' };
    logCronSummary('cascade', summary, startedAt);
    return NextResponse.json(summary);
  }

  try {
    // Suggestions close before voting resolves: a poll whose suggest deadline
    // just passed should be in `voting` before the resolver looks at it, not
    // resolved out of `suggesting` in the same tick.
    const suggestionsClosed = await sweepSuggestionDeadlines();
    const [eventsAdvanced, pollsResolved, remindersSent, cleaned] = await Promise.all([
      sweepCascades(),
      sweepDuePolls(),
      sweepReminders(),
      sweepExpired(),
    ]);
    const smsAccepted = await sweepSmsJobs();
    const summary = {
      ok: true,
      smsAccepted,
      eventsAdvanced,
      suggestionsClosed,
      pollsResolved,
      remindersSent,
      signalsDeleted: cleaned.signalsDeleted,
      momentsClosed: cleaned.momentsClosed,
      liveLocationsDeleted: cleaned.liveLocationsDeleted,
      contactVerificationRequestsDeleted:
        cleaned.contactVerificationRequestsDeleted,
      rateLimitsDeleted: cleaned.rateLimitsDeleted,
      notificationsDeleted: cleaned.notificationsDeleted,
      momentsDeleted: cleaned.momentsDeleted,
    };

    // Log even if the heartbeat write itself fails: the work happened, and the
    // one-line count is the evidence needed to diagnose a red health probe.
    try {
      await finishCronSweep('cascade', summary);
    } finally {
      logCronSummary('cascade', summary, startedAt);
    }
    return NextResponse.json(summary);
  } catch (error) {
    logCronFailure('cascade', error, startedAt);
    throw error;
  }
}
