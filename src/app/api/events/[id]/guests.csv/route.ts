import { createClient } from '@/lib/supabase/server';

function csvField(value: string | null | undefined): string {
  const v = value ?? '';
  // Quote if it contains a comma, quote, or newline; double any quotes.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

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
      csvField(profile?.display_name ?? row.guest_name),
      csvField(profile?.handle ? `@${profile.handle}` : ''),
      csvField(profile ? '' : row.guest_contact),
      csvField(row.status),
      csvField(row.responded_at),
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
