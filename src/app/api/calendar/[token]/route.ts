import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { buildCalendar, type IcsEvent } from '@/lib/ics';

/**
 * Personal calendar subscription. The unguessable token identifies the user;
 * the feed emits their upcoming plans (hosted, co-hosted, or accepted) as
 * iCalendar so any calendar app can follow along. Token-authed and public (no
 * session), so it's listed in the middleware's public prefixes. Revoke by
 * regenerating the token.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!hasAdminCredentials()) return new Response('Not available', { status: 503 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('calendar_token', token)
    .maybeSingle();
  if (!profile) return new Response('Not found', { status: 404 });

  // Plans this user hosts, co-hosts, or has accepted, from a day ago onward.
  // Only `accepted` counts as going: a waitlisted yes, or one still waiting on
  // a guardian's approval, holds no seat and does not belong on a calendar.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: hosted }, { data: acceptedInvites }, { data: cohostRows }] = await Promise.all([
    admin
      .from('events')
      .select('id, title, description, location_name, location_address, starts_at, ends_at')
      .eq('host_id', profile.id)
      .neq('status', 'cancelled')
      .gte('starts_at', since),
    admin
      .from('invites')
      .select('event:events(id, title, description, location_name, location_address, starts_at, ends_at, status)')
      .eq('invitee_id', profile.id)
      .eq('status', 'accepted'),
    admin
      .from('event_cohosts')
      .select('event_id')
      .eq('cohost_id', profile.id),
  ]);
  // Co-hosted plans by primary key, scoped to the rows this token's owner
  // co-hosts — the membership read above is the authorization.
  const cohostedIds = (cohostRows ?? []).map((row) => row.event_id as string);
  const { data: cohosted } = cohostedIds.length > 0
    ? await admin
        .from('events')
        .select('id, title, description, location_name, location_address, starts_at, ends_at')
        .in('id', cohostedIds)
        .neq('status', 'cancelled')
        .gte('starts_at', since)
    : { data: [] };

  const byId = new Map<string, IcsEvent>();
  for (const event of [...(hosted ?? []), ...(cohosted ?? [])]) {
    byId.set(event.id, event);
  }
  for (const row of acceptedInvites ?? []) {
    const event = Array.isArray(row.event) ? row.event[0] : row.event;
    if (event && event.status !== 'cancelled' && event.starts_at && event.starts_at >= since) {
      byId.set(event.id, event);
    }
  }

  const ics = buildCalendar([...byId.values()], new Date().toISOString());

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // Let calendar clients cache briefly; they refresh on their own cadence.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
