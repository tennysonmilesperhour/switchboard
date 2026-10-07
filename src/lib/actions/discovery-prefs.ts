'use server';

import { validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';
import {
  AUDIENCES,
  GENDERS,
  MAX_MOOD_HOURS,
  clampBar,
  clampWeight,
  isAudience,
  isGender,
  isSelf,
  moodInfo,
  parseItemKey,
  type Audience,
  type Gender,
  type MoodPreset,
  type Self,
} from '@/lib/discovery-lanes';

/**
 * Lane settings, weights, mood, and the private tap history.
 *
 * All of it is owner-only under RLS and none of it is authority state, so these
 * write through the caller's own session. The rule that uses it lives in the
 * database; what this file owns is refusing values the screens never send.
 */

export interface SelfInput {
  enabled: boolean;
  bar: number;
  visible_to: Audience;
  seeking: Audience;
  blurb: string;
  identifies_as: Gender | null;
  interested_in: Gender[];
}

const MAX_BLURB = 140;
const MAX_WEIGHTS_PER_CALL = 200;
const MAX_ITEMS = 60;

function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export async function saveSelf(self: Self, input: SelfInput): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!isSelf(self)) return validation('Choose a lane.');
  if (!isAudience(input?.visible_to) || !isAudience(input?.seeking)) {
    return validation(`Choose one of: ${AUDIENCES.join(', ')}.`);
  }

  const dating = self === 'dating';
  const identifies = dating && isGender(input.identifies_as) ? input.identifies_as : null;
  const interested = dating && Array.isArray(input.interested_in)
    ? [...new Set(input.interested_in.filter(isGender))].filter((g) => GENDERS.includes(g))
    : [];

  const enabled = input.enabled === true;
  const { error } = await supabase.from('discovery_selves').upsert(
    {
      user_id: user.id,
      self,
      enabled,
      bar: clampBar(input.bar),
      visible_to: input.visible_to,
      seeking: input.seeking,
      blurb: oneLine(input.blurb, MAX_BLURB),
      identifies_as: identifies,
      interested_in: interested,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,self' },
  );
  if (error) {
    return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error, { self });
  }

  // Turning a lane on is asking to be found in it. Discoverable is the master
  // switch every lane sits under, so it comes on with the first lane.
  if (enabled) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ discoverable: true })
      .eq('id', user.id);
    if (profileError) {
      return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', profileError, { self });
    }
  }

  revalidatePath('/discover');
  revalidatePath('/discover/preferences');
  return { ok: true };
}

export async function saveWeights(
  self: Self,
  weights: ReadonlyArray<{ item: string; weight: number }>,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!isSelf(self)) return validation('Choose a lane.');
  if (!Array.isArray(weights) || weights.length === 0) return { ok: true };
  if (weights.length > MAX_WEIGHTS_PER_CALL) return validation('That’s more changes than fit at once.');

  const rows: Array<{ user_id: string; self: Self; item: string; weight: number }> = [];
  const seen = new Set<string>();
  for (const entry of weights) {
    const item = typeof entry?.item === 'string' ? entry.item : '';
    if (!parseItemKey(item) || item.length > 100 || seen.has(item)) continue;
    seen.add(item);
    rows.push({ user_id: user.id, self, item, weight: clampWeight(entry.weight) });
  }
  if (rows.length === 0) return { ok: true };

  const { error } = await supabase
    .from('discovery_weights')
    .upsert(rows, { onConflict: 'user_id,self,item' });
  if (error) {
    return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error, { self });
  }
  revalidatePath('/discover');
  revalidatePath('/discover/preferences');
  return { ok: true };
}

/** Start a mood. It ends by itself; there is nothing to remember to undo. */
export async function setMood(
  preset: MoodPreset,
  includeItems: readonly string[] = [],
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const info = moodInfo(preset);
  if (!info) return validation('Choose a mood.');

  const include = [...new Set((Array.isArray(includeItems) ? includeItems : []).filter(
    (item): item is string => typeof item === 'string' && parseItemKey(item) !== null && item.length <= 100,
  ))].slice(0, MAX_ITEMS);

  const hours = Math.min(info.hours, MAX_MOOD_HOURS);
  const { error } = await auth.supabase.from('discovery_mood').upsert(
    {
      user_id: auth.user.id,
      preset: info.id,
      bar_shift: info.barShift,
      only_selves: info.onlySelves,
      include_items: include,
      expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error, { preset });
  }
  revalidatePath('/discover');
  revalidatePath('/discover/preferences');
  return { ok: true };
}

/** Pull items below the bar into the current mood, or put them back. */
export async function setMoodIncludes(includeItems: readonly string[]): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const include = [...new Set((Array.isArray(includeItems) ? includeItems : []).filter(
    (item): item is string => typeof item === 'string' && parseItemKey(item) !== null && item.length <= 100,
  ))].slice(0, MAX_ITEMS);

  const { data, error } = await auth.supabase
    .from('discovery_mood')
    .update({ include_items: include })
    .eq('user_id', auth.user.id)
    .gt('expires_at', new Date().toISOString())
    .select('user_id');
  if (error) {
    return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error, {});
  }
  if (!data?.length) return validation('That mood has already ended.');
  revalidatePath('/discover');
  revalidatePath('/discover/preferences');
  return { ok: true };
}

export async function clearMood(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from('discovery_mood')
    .delete()
    .eq('user_id', auth.user.id);
  if (error) {
    return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error, {});
  }
  revalidatePath('/discover');
  revalidatePath('/discover/preferences');
  return { ok: true };
}

/**
 * Remember a tap so the app can learn from it, privately. A pass also keeps that
 * person out of this lane's browse for thirty days (enforced in the database).
 * They are never told either way.
 */
export async function recordDiscoverySignal(
  targetId: string,
  self: Self,
  kind: 'accepted' | 'passed',
  items: readonly string[] = [],
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!isSelf(self) || (kind !== 'accepted' && kind !== 'passed')) return validation('That didn’t make sense.');
  if (typeof targetId !== 'string' || targetId === user.id) return validation('That didn’t make sense.');

  const keys = [...new Set((Array.isArray(items) ? items : []).filter(
    (item): item is string => typeof item === 'string' && parseItemKey(item) !== null && item.length <= 100,
  ))].slice(0, 12);

  const { error } = await supabase.from('discovery_signals').insert({
    user_id: user.id,
    target_id: targetId,
    self,
    kind,
    items: keys,
  });
  if (error) {
    // A target that does not exist is the caller's mistake, not an outage.
    if (error.code === '23503') return validation('That person is no longer there.');
    return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error, { self, kind });
  }
  if (kind === 'passed') revalidatePath('/discover');
  return { ok: true };
}

export async function resetDiscoveryHistory(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from('discovery_signals')
    .delete()
    .eq('user_id', auth.user.id);
  if (error) {
    return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error, {});
  }
  revalidatePath('/discover');
  revalidatePath('/discover/preferences');
  return { ok: true };
}

