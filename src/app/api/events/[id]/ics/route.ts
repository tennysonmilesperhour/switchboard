import { createClient } from '@/lib/supabase/server';

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Add-to-calendar: downloads a .ics for any event the viewer can see. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS decides visibility — no extra checks needed.
  const { data: event } = await supabase
    .from('events')
    .select('id, title, description, location_name, location_address, starts_at, ends_at')
    .eq('id', id)
    .single();

  if (!event || !event.starts_at) {
    return new Response('Not found', { status: 404 });
  }

  const start = icsDate(event.starts_at);
  const end = icsDate(
    event.ends_at ??
      new Date(new Date(event.starts_at).getTime() + 2 * 3_600_000).toISOString(),
  );
  const location = [event.location_name, event.location_address]
    .filter(Boolean)
    .join(', ');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Switchboard//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@switchboard`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(event.title)}`,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : null,
    location ? `LOCATION:${icsEscape(location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="switchboard-${event.id}.ics"`,
    },
  });
}
