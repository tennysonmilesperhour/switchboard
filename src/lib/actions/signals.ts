'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { reportAndFail } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';
import { notifyNearbyFriends } from '@/lib/server/signal-nearby';
import type { createClient } from '@/lib/supabase/server';
import { AUDIENCE_LIMITS, type SignalAudience } from '@/lib/signal-audience';

const DEFAULT_DURATION_HOURS = 3;
const MAX_SIGNALS_PER_ACTIVATION = 12;
const LABEL_MAX = 40;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export interface SignalChoice {
  emoji: string;
  label: string;
}

function cleanIds(raw: unknown, max: number): string[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const ids = [...new Set(raw)];
  if (!ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))) return null;
  return ids as string[];
}

/**
 * Reject foreign, malformed, and duplicate circle ids before any write.
 *
 * The RLS policy on `availability_signals` already refuses to show a signal to
 * anyone outside a circle its *owner* owns (`viewer_in_signal_audience`), so a
 * foreign id could never widen who sees a signal — but it would still be stored
 * and remembered as a preference, which is how a stranger's circle id would
 * end up on this person's profile. The circles read goes through the caller's
 * own RLS client, so a row that comes back is one they own.
 */
async function ownedCircles(
  supabase: SessionClient,
  userId: string,
  raw: string[],
): Promise<string[] | null> {
  const circleIds = cleanIds(raw, AUDIENCE_LIMITS.circles);
  if (!circleIds) return null;
  if (circleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('circles')
    .select('id')
    .eq('owner_id', userId)
    .in('id', circleIds);
  if (error || data?.length !== circleIds.length) return null;
  return circleIds;
}

/**
 * Specific people have to be accepted connections. The policy re-checks this
 * at read time, but a name that is not a friend should be refused up front
 * rather than stored as a dead entry the composer then shows as "1 person".
 */
async function connectedPeople(
  supabase: SessionClient,
  userId: string,
  raw: string[],
): Promise<string[] | null> {
  const personIds = cleanIds(raw, AUDIENCE_LIMITS.people);
  if (!personIds) return null;
  if (personIds.length === 0) return [];
  if (personIds.includes(userId)) return null;
  const { data, error } = await supabase
    .from('connections')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) return null;
  const friends = new Set(
    (data ?? []).map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id)),
  );
  return personIds.every((id) => friends.has(id)) ? personIds : null;
}

/**
 * Groups are boards the caller belongs to. `boards_select` returns only those,
 * so a count mismatch means an id that is not one of theirs.
 */
async function memberBoards(
  supabase: SessionClient,
  raw: string[],
): Promise<string[] | null> {
  const boardIds = cleanIds(raw, AUDIENCE_LIMITS.groups);
  if (!boardIds) return null;
  if (boardIds.length === 0) return [];
  const { data, error } = await supabase.from('boards').select('id').in('id', boardIds);
  if (error || data?.length !== boardIds.length) return null;
  return boardIds;
}

/**
 * Remember the circle a fresh composer should start from. The database re-checks
 * ownership (`set_my_signal_default_circle` and the profiles trigger), so this
 * is the second of two gates, not the only one.
 */
async function rememberSignalCircle(
  supabase: SessionClient,
  circleId: string | null,
): Promise<unknown> {
  if (!circleId) return null;
  const { error } = await supabase.rpc('set_my_signal_default_circle', {
    p_circle: circleId,
  });
  return error;
}

/**
 * Turn one or more signals on, each with the audience given here.
 *
 * This is the "finalize" step the client asked for: the composer collects
 * statuses and an audience locally and nothing reaches the database until
 * this runs. Re-activating a label that is already live replaces it (new
 * audience, fresh expiry) rather than duplicating it, which is also how a
 * live signal's audience is edited.
 *
 * An audience with no circles, people, or groups means everyone the person is
 * connected to — the same meaning an empty `circle_ids` has always had.
 */
export async function activateSignals(
  signals: SignalChoice[],
  audience: SignalAudience,
  durationHours: number = DEFAULT_DURATION_HOURS,
): Promise<ActionResult> {
  if (!Array.isArray(signals) || signals.length === 0) {
    return validation('Pick at least one status.');
  }
  if (signals.length > MAX_SIGNALS_PER_ACTIVATION) {
    return validation(`Pick up to ${MAX_SIGNALS_PER_ACTIVATION} statuses at a time.`);
  }
  const hours = Number.isFinite(durationHours)
    ? Math.min(24, Math.max(0.25, durationHours))
    : DEFAULT_DURATION_HOURS;

  const chosen = new Map<string, SignalChoice>();
  for (const signal of signals) {
    const label = String(signal?.label ?? '')
      .trim()
      .replace(/[\r\n]+/g, ' ')
      .slice(0, LABEL_MAX);
    const emoji = String(signal?.emoji ?? '').trim().slice(0, 12);
    if (!label || !emoji) return validation('Add an emoji and a short status.');
    chosen.set(label, { emoji, label });
  }

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Signals stay quiet during a sabbatical.
  const { data: profile } = await supabase
    .from('profiles')
    .select('sabbatical')
    .eq('id', user.id)
    .single();
  if (profile?.sabbatical) {
    return failure('SB-SIGNAL-PAUSED');
  }

  const [circleIds, personIds, boardIds] = await Promise.all([
    ownedCircles(supabase, user.id, audience?.circleIds ?? []),
    connectedPeople(supabase, user.id, audience?.personIds ?? []),
    memberBoards(supabase, audience?.boardIds ?? []),
  ]);
  if (!circleIds) return validation('Choose circles from your own list.');
  if (!personIds) return validation('Choose people you are connected to.');
  if (!boardIds) return validation('Choose groups you belong to.');

  const rememberError = await rememberSignalCircle(supabase, circleIds.at(-1) ?? null);
  if (rememberError) {
    return reportAndFail('SB-SIGNAL-SAVE', 'signal.activate', rememberError);
  }

  // Re-activating the same status replaces it rather than duplicating. The new
  // rows go in first and the old ones come out after: deleting first meant a
  // failed insert left the person with their status silently switched off.
  const labels = [...chosen.keys()];
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
  const { data: inserted, error } = await supabase
    .from('availability_signals')
    .insert(
      [...chosen.values()].map((signal) => ({
        user_id: user.id,
        emoji: signal.emoji,
        label: signal.label,
        circle_ids: circleIds,
        person_ids: personIds,
        board_ids: boardIds,
        expires_at: expiresAt,
      })),
    )
    .select('id, label');
  if (error) return reportAndFail('SB-SIGNAL-SAVE', 'signal.activate', error);

  // Ids come from the insert above, so interpolating them is safe. Without
  // them there is no way to tell new rows from old, so the old ones stay (a
  // duplicate status is a smaller problem than deleting the one just saved).
  const freshIds = (inserted ?? []).map((row) => row.id);
  if (freshIds.length > 0) {
    const { error: clearError } = await supabase
      .from('availability_signals')
      .delete()
      .eq('user_id', user.id)
      .in('label', labels)
      .not('id', 'in', `(${freshIds.join(',')})`);
    if (clearError) return reportAndFail('SB-SIGNAL-SAVE', 'signal.activate', clearError);
  }
  revalidatePath('/');

  // A discoverable friend who is close by hears about it. After the response,
  // so turning a status on never waits on (or fails because of) the notices.
  const turnedOn = (inserted ?? []).map((row) => ({ id: row.id, label: row.label }));
  after(() => notifyNearbyFriends(user.id, turnedOn));
  return { ok: true };
}

/** Turn a single availability signal off, leaving the others live. */
export async function removeSignal(
  label: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { error } = await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id)
    .eq('label', label);
  if (error) return reportAndFail('SB-SIGNAL-SAVE', 'signal.remove', error);
  revalidatePath('/');
  return { ok: true };
}

/** Turn every signal off at once. */
export async function clearSignal(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { error } = await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id);
  if (error) return reportAndFail('SB-SIGNAL-SAVE', 'signal.clear', error);
  revalidatePath('/');
  return { ok: true };
}
