import { NextResponse } from 'next/server';
import { sweepDigests } from '@/lib/server/digest';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { bearerMatches } from '@/lib/server/secret';

export const maxDuration = 60;

/**
 * Hourly cron: send the daily digest to everyone whose digest hour it is, in
 * their own time zone.
 *
 * Hourly rather than daily because "8am" is a different instant for everyone,
 * and a once-a-day job can only ever be 8am somewhere. Sending at most one a
 * day is guaranteed by `digest_sent_at`, not by this schedule — a cron that
 * fires twice, or a retry after a partial failure, must not produce two
 * digests.
 */
export async function GET(request: Request) {
  // Fail closed: an unset secret must never leave the sweep publicly invokable.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await checkRateLimit('cron:digest', 5, 60))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const sent = await sweepDigests();
  return NextResponse.json({ ok: true, sent });
}
