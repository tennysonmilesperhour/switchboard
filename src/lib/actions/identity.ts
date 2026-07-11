'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { FACET_KEYS, type FacetKey } from '@/lib/engine/identity';

function isFacetKey(key: string): key is FacetKey {
  return (FACET_KEYS as readonly string[]).includes(key);
}

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
