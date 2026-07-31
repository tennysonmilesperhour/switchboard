import { ImageResponse } from 'next/og';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { resolveEventZone } from '@/lib/server/event-zone';
import { shareLinkState, unfurlsPlanDetails } from '@/lib/share-link';
import type { EventStatus } from '@/lib/types';

export const runtime = 'nodejs';

/** Dynamic OG image so event links unfurl beautifully in messaging apps. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Guard the service-role client the way the calendar feed and RSVP page do —
  // without credentials createAdminClient() throws. In practice the OG URL is
  // only emitted when creds exist, so this just degrades safely rather than
  // 500-ing if the route is hit directly on a no-creds deploy.
  if (!hasAdminCredentials()) {
    return new Response('Not found', { status: 404 });
  }
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('title, starts_at, location_name, status, share_link_active, time_zone, host_id')
    .eq('id', id)
    .maybeSingle<{
      title: string | null;
      starts_at: string | null;
      location_name: string | null;
      status: EventStatus;
      share_link_active: boolean;
      time_zone: string | null;
      host_id: string;
    }>();

  // Only unfurl details for a plan that is actually being shared, decided by the
  // same classifier as /i/<token> rather than a status list maintained here.
  // This route is keyed by event *id* — far more guessable than a share token —
  // so `unfurlsPlanDetails` is deliberately stricter than "can a token holder
  // read this": a draft, a cancelled plan, a past plan, or one whose link the
  // host switched off falls back to the generic card and leaks nothing.
  const shareable = unfurlsPlanDetails(shareLinkState(event));
  const title = shareable && event?.title ? event.title : 'You’re invited';
  // Render in the plan's own zone so the unfurl shows the host's intended local
  // time instead of the server's UTC (a 6pm plan was showing as "12:00 AM").
  // Fall back to the host's profile zone for plans created before the zone was
  // captured on the event itself.
  const zone = shareable ? await resolveEventZone(admin, event) : null;
  const when =
    shareable && event?.starts_at
      ? new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          ...(zone ? { timeZone: zone, timeZoneName: 'short' } : {}),
        }).format(new Date(event.starts_at))
      : '';
  const where = shareable && event?.location_name ? event.location_name : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#f7f3ea',
          color: '#2e2620',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 32, color: '#b0563a' }}>
          Switchboard
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 76, lineHeight: 1.05, fontWeight: 700 }}>
            {title.length > 60 ? `${title.slice(0, 57)}…` : title}
          </div>
          {when ? (
            <div style={{ display: 'flex', fontSize: 34, color: '#6d5f52' }}>
              {when}
              {where ? ` · ${where}` : ''}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#9a8a7a' }}>
          Plans without the pressure
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
