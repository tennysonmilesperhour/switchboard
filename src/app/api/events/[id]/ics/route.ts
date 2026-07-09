import { createClient } from '@/lib/supabase/server';
import { buildCalendar, type IcsEvent } from '@/lib/ics';

/** Add-to-calendar: downloads a .ics for any event the viewer can see. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS decides visibility - no extra checks needed.
  const { data: event } = await supabase
    .from('events')
    .select('id, title, description, location_name, location_address, starts_at, ends_at')
    .eq('id', id)
    .single<IcsEvent>();

  if (!event || !event.starts_at) {
    return new Response('Not found', { status: 404 });
  }

  const ics = buildCalendar([event], new Date().toISOString());

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="switchboard-${event.id}.ics"`,
    },
  });
}
