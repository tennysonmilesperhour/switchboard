import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit }));

import {
  consumeEventOutboundSlot,
  EVENT_OUTBOUND_DAILY_LIMIT,
} from './invite-delivery-limit';

describe('external event delivery limit', () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue(true);
  });

  it('meters all external channels against a durable daily host key', async () => {
    await expect(
      consumeEventOutboundSlot('host-1', 'invitation'),
    ).resolves.toBe(true);
    await expect(
      consumeEventOutboundSlot('host-1', 'cancellation'),
    ).resolves.toBe(true);

    expect(checkRateLimit).toHaveBeenNthCalledWith(
      1,
      'event-outbound:invitation:host-1',
      EVENT_OUTBOUND_DAILY_LIMIT,
      86_400,
    );
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      2,
      'event-outbound:cancellation:host-1',
      EVENT_OUTBOUND_DAILY_LIMIT,
      86_400,
    );
  });
});
