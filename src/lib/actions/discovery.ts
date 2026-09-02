'use server';

import { failure, type ActionResult } from '@/lib/errors';

import { reportAndFail } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';
import {
  discoverActivities,
  type DiscoveryInput,
  type Suggestion,
} from '@/lib/ai/discovery';
import { checkRateLimit } from '@/lib/server/rate-limit';

export async function runDiscovery(
  input: DiscoveryInput,
): Promise<ActionResult & { suggestions: Suggestion[] }> {
  const auth = await requireUser();
  if (!auth.ok) return { ...auth, suggestions: [] };
  const { supabase, user } = auth;
  if (!(await checkRateLimit(`ai:discovery:${user.id}`, 20, 60 * 60))) {
    return {
      ...failure(
        'SB-RATE-LIMIT',
        'You’ve made a lot of suggestions. Try again in a little while.',
      ),
      suggestions: [],
    };
  }

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

  try {
    const suggestions = await discoverActivities({ ...input, interests });
    return { ok: true, suggestions };
  } catch (error) {
    return {
      ...(await reportAndFail('SB-DISCOVERY-RUN', 'discovery.run', error)),
      suggestions: [],
    };
  }
}
