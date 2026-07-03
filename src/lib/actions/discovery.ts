'use server';

import { createClient } from '@/lib/supabase/server';
import {
  discoverActivities,
  type DiscoveryInput,
  type Suggestion,
} from '@/lib/ai/discovery';

export async function runDiscovery(
  input: DiscoveryInput,
): Promise<{ ok: boolean; suggestions: Suggestion[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, suggestions: [], error: 'Not signed in' };

  // Personalize with stored interests when the form leaves them blank.
  let interests = input.interests;
  if (interests.length === 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('interests')
      .eq('id', user.id)
      .single();
    interests = profile?.interests ?? [];
  }

  const suggestions = await discoverActivities({ ...input, interests });
  return { ok: true, suggestions };
}
