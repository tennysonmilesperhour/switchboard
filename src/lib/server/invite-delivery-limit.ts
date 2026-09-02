import { checkRateLimit } from '@/lib/server/rate-limit';

export const EVENT_OUTBOUND_DAILY_LIMIT = 100;

export type EventOutboundPurpose = 'invitation' | 'cancellation';

/** Consume one durable, per-host external-delivery slot. */
export async function consumeEventOutboundSlot(
  hostId: string,
  purpose: EventOutboundPurpose,
): Promise<boolean> {
  return checkRateLimit(
    `event-outbound:${purpose}:${hostId}`,
    EVENT_OUTBOUND_DAILY_LIMIT,
    24 * 60 * 60,
  );
}
