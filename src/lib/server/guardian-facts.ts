import 'server-only';

import type { createAdminClient } from '@/lib/supabase/admin';
import { formatDateTimeRange } from '@/lib/format';
import type { GuardianPlanFacts } from '@/lib/guardian-approval';
import { looksLikeContactString } from '@/lib/invitee-contact';
import { resolveEventZone } from '@/lib/server/event-zone';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * What a guardian is shown about one RSVP (decision D2): the plan's title,
 * when and where, the host's name, and who said yes. Read with the service-role
 * client, so every caller must already have authorized the exact invite and
 * plan — the invitee's own RLS-visible invite, a manager check, or the
 * guardian's token.
 */
export async function loadGuardianPlanFacts(
  admin: Admin,
  eventId: string,
  inviteId: string,
): Promise<GuardianPlanFacts | null> {
  const [{ data: event }, { data: invite }] = await Promise.all([
    admin
      .from('events')
      .select('title, starts_at, ends_at, time_zone, location_name, location_address, host_id')
      .eq('id', eventId)
      .maybeSingle(),
    admin
      .from('invites')
      .select('invitee_id, guest_name, event_id')
      .eq('id', inviteId)
      .maybeSingle(),
  ]);
  if (!event || !invite || invite.event_id !== eventId) return null;

  const ids = [event.host_id, invite.invitee_id].filter((id): id is string => Boolean(id));
  const [{ data: people }, zone] = await Promise.all([
    admin.from('profiles').select('id, display_name').in('id', ids),
    resolveEventZone(admin, event),
  ]);
  const nameOf = (id: string | null) =>
    (people ?? []).find((person) => person.id === id)?.display_name?.trim() || null;

  const guestName = invite.guest_name?.trim() ?? '';
  const place = [event.location_name?.trim(), event.location_address?.trim()]
    .filter((part, index, parts): part is string =>
      Boolean(part) && parts.indexOf(part) === index,
    )
    .join(', ');

  return {
    title: event.title,
    when: formatDateTimeRange(event.starts_at, event.ends_at, zone),
    where: place || null,
    hostName: nameOf(event.host_id) ?? 'The host',
    inviteeName:
      nameOf(invite.invitee_id) ??
      (guestName && !looksLikeContactString(guestName) ? guestName : 'Someone'),
  };
}
