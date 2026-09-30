'use server';

import { failure, type ActionResult } from '@/lib/errors';

import { reportAndFail } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';
import {
  discoverActivities,
  FALLBACK_NOTICE,
  type DiscoveryInput,
  type Suggestion,
} from '@/lib/ai/discovery';
import {
  DEFAULT_BUDGET,
  DISCOVERY_BUDGETS,
  DISCOVERY_LIMITS,
  DISCOVERY_VIBES,
  normalizeGroupSize,
} from '@/lib/ai/discovery-options';
import { checkRateLimit } from '@/lib/server/rate-limit';

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Hold a search to what the form can send. This is a server action, so nothing
 * stopped a direct call from putting a novel into "Where?" — and every field
 * goes into a model prompt (paid per token) and a request log.
 */
function boundInput(input: DiscoveryInput): DiscoveryInput {
  const miles = Number(input?.distanceMiles);
  const budget = (DISCOVERY_BUDGETS as readonly string[]).includes(input?.budget)
    ? input.budget
    : DEFAULT_BUDGET;
  const vibes = Array.isArray(input?.vibes)
    ? [...new Set(input.vibes.filter((vibe) => (DISCOVERY_VIBES as readonly string[]).includes(vibe)))]
    : [];
  const interests = Array.isArray(input?.interests)
    ? [
        ...new Set(
          input.interests
            .map((interest) => text(interest, DISCOVERY_LIMITS.interestLength))
            .filter(Boolean),
        ),
      ].slice(0, DISCOVERY_LIMITS.interests)
    : [];
  return {
    location: text(input?.location, DISCOVERY_LIMITS.location),
    distanceMiles: Number.isFinite(miles)
      ? Math.min(DISCOVERY_LIMITS.maxMiles, Math.max(DISCOVERY_LIMITS.minMiles, Math.round(miles)))
      : 15,
    when: text(input?.when, DISCOVERY_LIMITS.when),
    budget,
    groupSize: normalizeGroupSize(typeof input?.groupSize === 'string' ? input.groupSize : ''),
    openToMeeting: input?.openToMeeting === true,
    vibes,
    interests,
  };
}

export async function runDiscovery(
  input: DiscoveryInput,
): Promise<ActionResult & { suggestions: Suggestion[]; notice?: string | null }> {
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

  const bounded = boundInput(input);

  // Personalize with stored interests when the form leaves them blank.
  let interests = bounded.interests;
  if (interests.length === 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('interests')
      .eq('id', user.id)
      .single();
    interests = (profile?.interests ?? [])
      .map((interest) => text(interest, DISCOVERY_LIMITS.interestLength))
      .filter(Boolean)
      .slice(0, DISCOVERY_LIMITS.interests);
  }

  try {
    const result = await discoverActivities({ ...bounded, interests });
    return {
      ok: true,
      suggestions: result.suggestions,
      notice: result.tailored ? null : FALLBACK_NOTICE,
    };
  } catch (error) {
    return {
      ...(await reportAndFail('SB-DISCOVERY-RUN', 'discovery.run', error)),
      suggestions: [],
    };
  }
}
