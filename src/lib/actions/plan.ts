'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { requireUser } from '@/lib/server/require-user';
import { localToday, parsePlan, type ParsedPlan } from '@/lib/ai/plan-parser';
import { checkRateLimit } from '@/lib/server/rate-limit';

export interface PlanDraft extends Omit<ParsedPlan, 'inviteeNames'> {
  invitees: Array<{ id: string; name: string }>;
}

/**
 * Voice-first planning: description in, wizard prefill out.
 *
 * `timeZone` is the host's browser zone, so "tomorrow" and "tonight" resolve
 * to their dates rather than the server's UTC one. It is only ever used to
 * read a calendar date; an unknown value falls back to UTC.
 */
export async function parsePlanDescription(
  text: string,
  timeZone: string | null = null,
): Promise<ActionResult & { draft?: PlanDraft }> {
  const trimmed = text.trim();
  if (!trimmed) return validation('Say or type a plan first');

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!(await checkRateLimit(`ai:plan:${user.id}`, 30, 60 * 60))) {
    return failure(
      'SB-RATE-LIMIT',
      'You’ve drafted a lot of plans. Try again in a little while.',
    );
  }

  const { data: connections } = await supabase
    .from('connections')
    .select(
      'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name), addressee:profiles!connections_addressee_id_fkey(id, display_name)',
    )
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friends = (connections ?? []).map((connection) => {
    const otherRaw =
      connection.requester_id === user.id ? connection.addressee : connection.requester;
    const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
    return { id: other.id as string, name: other.display_name as string };
  });

  const parsed = await parsePlan(
    trimmed,
    friends.map((f) => f.name),
    localToday(new Date(), typeof timeZone === 'string' ? timeZone.slice(0, 64) : null),
  );

  const invitees = parsed.inviteeNames
    .map((name) => friends.find((f) => f.name.toLowerCase() === name.toLowerCase()))
    .filter((f): f is { id: string; name: string } => Boolean(f));

  return {
    ok: true,
    draft: {
      title: parsed.title,
      date: parsed.date,
      time: parsed.time,
      locationName: parsed.locationName,
      capacity: parsed.capacity,
      mode: parsed.mode,
      invitees,
    },
  };
}
