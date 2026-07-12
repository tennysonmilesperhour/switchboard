import { createClient } from '@/lib/supabase/server';
import { csvCell } from '@/lib/security';

/** Host-only guest-list export. RLS: only the host can read all invites. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: event } = await supabase
    .from('events')
    .select('id, host_id, title')
    .eq('id', id)
    .single();
  if (!event || event.host_id !== user.id) {
    return new Response('Not found', { status: 404 });
  }

  const { data: invites } = await supabase
    .from('invites')
    .select('guest_name, guest_contact, status, position, responded_at, invitee:profiles(display_name, handle)')
    .eq('event_id', id)
    .order('position');

  const header = ['name', 'handle', 'contact', 'status', 'responded_at'];
  const rows = (invites ?? []).map((row) => {
    const profile = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;
    return [
      csvCell(profile?.display_name ?? row.guest_name),
      csvCell(profile?.handle ? `@${profile.handle}` : ''),
      csvCell(profile ? '' : row.guest_contact),
      csvCell(row.status),
      csvCell(row.responded_at),
    ].join(',');
  });
  const csv = [header.join(','), ...rows].join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="switchboard-guests-${event.id}.csv"`,
    },
  });
}
