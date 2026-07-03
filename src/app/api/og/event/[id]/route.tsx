import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/** Dynamic OG image so event links unfurl beautifully in messaging apps. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('title, starts_at, location_name')
    .eq('id', id)
    .maybeSingle();

  const title = event?.title ?? 'You’re invited';
  const when = event?.starts_at
    ? new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(event.starts_at))
    : '';

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
          ✦ Switchboard
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 76, lineHeight: 1.05, fontWeight: 700 }}>
            {title.length > 60 ? `${title.slice(0, 57)}…` : title}
          </div>
          {when ? (
            <div style={{ display: 'flex', fontSize: 34, color: '#6d5f52' }}>
              {when}
              {event?.location_name ? ` · ${event.location_name}` : ''}
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
