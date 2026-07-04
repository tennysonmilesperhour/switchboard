'use server';

import { createClient } from '@/lib/supabase/server';
import { parsePlan, type ParsedPlan } from '@/lib/ai/plan-parser';

export interface PlanDraft extends Omit<ParsedPlan, 'inviteeNames'> {
  invitees: Array<{ id: string; name: string }>;
}

/** Voice-first planning: description in, wizard prefill out. */
export async function parsePlanDescription(
  text: string,
): Promise<{ ok: boolean; draft?: PlanDraft; error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Say or type a plan first' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

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
    new Date(),
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
