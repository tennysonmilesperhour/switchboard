import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  claimCronSweep: vi.fn(),
  finishCronSweep: vi.fn(),
  logCronFailure: vi.fn(),
  logCronSummary: vi.fn(),
  sweepCascades: vi.fn(),
  sweepSuggestionDeadlines: vi.fn(),
  sweepDuePolls: vi.fn(),
  sweepReminders: vi.fn(),
  sweepExpired: vi.fn(),
  sweepDigests: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock('@/lib/server/cron-runtime', () => ({
  claimCronSweep: mocks.claimCronSweep,
  finishCronSweep: mocks.finishCronSweep,
  logCronFailure: mocks.logCronFailure,
  logCronSummary: mocks.logCronSummary,
}));
vi.mock('@/lib/server/cascade-runner', () => ({
  sweepCascades: mocks.sweepCascades,
}));
vi.mock('@/lib/server/poll-runner', () => ({
  sweepSuggestionDeadlines: mocks.sweepSuggestionDeadlines,
  sweepDuePolls: mocks.sweepDuePolls,
}));
vi.mock('@/lib/server/reminders', () => ({
  sweepReminders: mocks.sweepReminders,
}));
vi.mock('@/lib/server/cleanup', () => ({ sweepExpired: mocks.sweepExpired }));
vi.mock('@/lib/server/digest', () => ({ sweepDigests: mocks.sweepDigests }));

import { GET as runCascade } from './cascade/route';
import { GET as runDigest } from './digest/route';

function cronRequest() {
  return new Request('http://localhost/api/cron', {
    headers: { Authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.claimCronSweep.mockResolvedValue(true);
  mocks.finishCronSweep.mockResolvedValue(undefined);
  mocks.sweepSuggestionDeadlines.mockResolvedValue(1);
  mocks.sweepCascades.mockResolvedValue(2);
  mocks.sweepDuePolls.mockResolvedValue(3);
  mocks.sweepReminders.mockResolvedValue(4);
  mocks.sweepExpired.mockResolvedValue({
    signalsDeleted: 5,
    momentsClosed: 6,
    liveLocationsDeleted: 7,
  });
  mocks.sweepDigests.mockResolvedValue(8);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('cron overlap leases', () => {
  it('lets only one of two simultaneous cascade requests do work', async () => {
    mocks.claimCronSweep
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const responses = await Promise.all([
      runCascade(cronRequest()),
      runCascade(cronRequest()),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(bodies).toContainEqual({ ok: true, skipped: 'overlap' });
    expect(bodies).toContainEqual({
      ok: true,
      eventsAdvanced: 2,
      suggestionsClosed: 1,
      pollsResolved: 3,
      remindersSent: 4,
      signalsDeleted: 5,
      momentsClosed: 6,
      liveLocationsDeleted: 7,
    });
    expect(mocks.sweepCascades).toHaveBeenCalledTimes(1);
    expect(mocks.sweepSuggestionDeadlines).toHaveBeenCalledTimes(1);
    expect(mocks.sweepDuePolls).toHaveBeenCalledTimes(1);
    expect(mocks.sweepReminders).toHaveBeenCalledTimes(1);
    expect(mocks.sweepExpired).toHaveBeenCalledTimes(1);
    expect(mocks.finishCronSweep).toHaveBeenCalledTimes(1);
  });

  it('records the digest heartbeat and counts after work finishes', async () => {
    const response = await runDigest(cronRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sent: 8 });
    expect(mocks.claimCronSweep).toHaveBeenCalledWith('digest');
    expect(mocks.finishCronSweep).toHaveBeenCalledWith('digest', {
      ok: true,
      sent: 8,
    });
    expect(mocks.logCronSummary).toHaveBeenCalledTimes(1);
  });
});
