'use server';

import { getOptionalUser } from '@/lib/server/require-user';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

export type PmfChoice = 'very' | 'somewhat' | 'not';

/** Records a Sean Ellis product-market-fit answer. Captures only the bucket,
 *  never free text, and no-ops on analytics when no key is set. */
export async function submitPmf(choice: PmfChoice): Promise<{ ok: boolean }> {
  const { user } = await getOptionalUser();
  await capture(user?.id ?? 'anon', ANALYTICS_EVENTS.pmfResponse, { choice });
  return { ok: true };
}
