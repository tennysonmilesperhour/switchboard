import { describe, expect, it } from 'vitest';

import {
  CRON_HEARTBEAT_MAX_AGE_MS,
  isCronHeartbeatFresh,
} from './cron-runtime';

describe('cron heartbeat freshness', () => {
  const now = Date.parse('2026-09-02T04:00:00.000Z');

  it('accepts a successful cascade run up to five minutes old', () => {
    expect(
      isCronHeartbeatFresh(
        new Date(now - CRON_HEARTBEAT_MAX_AGE_MS).toISOString(),
        now,
      ),
    ).toBe(true);
  });

  it('fails closed for an older, missing, or malformed heartbeat', () => {
    expect(
      isCronHeartbeatFresh(
        new Date(now - CRON_HEARTBEAT_MAX_AGE_MS - 1).toISOString(),
        now,
      ),
    ).toBe(false);
    expect(isCronHeartbeatFresh(null, now)).toBe(false);
    expect(isCronHeartbeatFresh('not-a-date', now)).toBe(false);
  });
});
