'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { FACET_KEYS, type FacetKey } from '@/lib/engine/identity';
import { generateReflection, type ReflectionKind } from '@/lib/ai/reflection';

function isFacetKey(key: string): key is FacetKey {
  return (FACET_KEYS as readonly string[]).includes(key);
}

// Operator behaviors and optional facet features the user can turn on. Kept as
// an allowlist so an arbitrary key can never be written.
const OPERATOR_KEYS = new Set([
  'facet_divergence',
  'facet_compatibility',
  'capacity_guard',
  'tune_windows',
]);

const REFLECTION_KINDS = new Set<ReflectionKind>(['general', 'relationships', 'desires']);

/**
 * Set a per-facet preference. `hidden` dismisses a facet from the owner's own
 * portrait; `sharedWithConnections` opts it in as a revealed-preference signal
 * visible to accepted connections. Both default off and are reversible.
 */
export async function setFacetPref(
  facetKey: string,
  patch: { hidden?: boolean; sharedWithConnections?: boolean },
): Promise<{ ok: boolean }> {
  if (!isFacetKey(facetKey)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const row: {
    user_id: string;
    facet_key: string;
    updated_at: string;
    hidden?: boolean;
    shared_with_connections?: boolean;
  } = {
    user_id: user.id,
    facet_key: facetKey,
    updated_at: new Date().toISOString(),
  };
  if (patch.hidden !== undefined) row.hidden = patch.hidden;
  if (patch.sharedWithConnections !== undefined) {
    row.shared_with_connections = patch.sharedWithConnections;
  }

  const { error } = await supabase
    .from('facet_prefs')
    .upsert(row, { onConflict: 'user_id,facet_key' });

  revalidatePath('/you');
  return { ok: !error };
}

/**
 * Record the user's verdict on a facet — the collaborative spine. The model
 * offers each read as a hypothesis; 'confirmed' affirms it, 'rejected' means
 * "not me" and suppresses it. Passing null clears the verdict.
 */
export async function setFacetVerdict(
  facetKey: string,
  verdict: 'confirmed' | 'rejected' | null,
): Promise<{ ok: boolean }> {
  if (!isFacetKey(facetKey)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from('facet_prefs').upsert(
    {
      user_id: user.id,
      facet_key: facetKey,
      verdict,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,facet_key' },
  );

  revalidatePath('/you');
  return { ok: !error };
}

/** Turn an operator behavior or optional facet feature on or off. */
export async function setOperatorSetting(
  key: string,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  if (!OPERATOR_KEYS.has(key)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from('operator_settings').upsert(
    {
      user_id: user.id,
      setting_key: key,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,setting_key' },
  );

  revalidatePath('/you');
  return { ok: !error };
}

/**
 * Generate and save a written reflection over the user's own facets. Gated on
 * having enough history (≥3 facets) so a reflection is worth reading.
 */
export async function requestReflection(
  kind: string,
): Promise<{ ok: boolean; reason?: string }> {
  const k = kind as ReflectionKind;
  if (!REFLECTION_KINDS.has(k)) return { ok: false, reason: 'unknown' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'auth' };

  // Reflect only over facets the user hasn't rejected — respect their verdicts.
  const [{ data: facetRows }, { data: prefRows }] = await Promise.all([
    supabase
      .from('identity_facets')
      .select('facet_key, title, summary')
      .eq('user_id', user.id),
    supabase.from('facet_prefs').select('facet_key, verdict').eq('user_id', user.id),
  ]);

  const rejected = new Set(
    (prefRows ?? [])
      .filter((p) => p.verdict === 'rejected')
      .map((p) => p.facet_key as string),
  );
  const facets = (facetRows ?? [])
    .filter((f) => !rejected.has(f.facet_key as string))
    .map((f) => ({ title: f.title as string, summary: f.summary as string }));

  if (facets.length < 3) return { ok: false, reason: 'not_ready' };

  const { body, source } = await generateReflection(k, facets);

  const { error } = await supabase
    .from('identity_reflections')
    .insert({ user_id: user.id, kind: k, body, source });

  revalidatePath('/you');
  return { ok: !error };
}
