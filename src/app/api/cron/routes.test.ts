vi.mock('@/lib/server/notification-emails', () => ({ sweepNotificationEmails: vi.fn().mockResolvedValue(0) }));
vi.mock('@/lib/server/sms-jobs', () => ({ sweepSmsJobs: vi.fn().mockResolvedValue(0) }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  sweepCascades: vi.fn(),
  sweepSuggestionDeadlines: vi.fn(),
  sweepDuePolls: vi.fn(),
  sweepReminders: vi.fn(),
  sweepExpired: vi.fn(),
  sweepDigests: vi.fn(),
  claimCronSweep: vi.fn(),
  finishCronSweep: vi.fn(),
  logCronFailure: vi.fn(),
  logCronSummary: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
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
vi.mock('@/lib/server/cron-runtime', () => ({
  claimCronSweep: mocks.claimCronSweep,
  finishCronSweep: mocks.finishCronSweep,
  logCronFailure: mocks.logCronFailure,
  logCronSummary: mocks.logCronSummary,
}));

import { GET as runCascade } from './cascade/route';
import { GET as runDigest } from './digest/route';

function cronRequest(secret = 'test-secret') {
  return new Request('http://localhost/api/cron', {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.sweepCascades.mockResolvedValue(2);
  mocks.sweepSuggestionDeadlines.mockResolvedValue(3);
  mocks.sweepDuePolls.mockResolvedValue(4);
  mocks.sweepReminders.mockResolvedValue(5);
  mocks.sweepExpired.mockResolvedValue({
    signalsDeleted: 6,
    momentsClosed: 7,
    liveLocationsDeleted: 8,
  });
  mocks.sweepDigests.mockResolvedValue(9);
  mocks.claimCronSweep.mockResolvedValue(true);
  mocks.finishCronSweep.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('cron route handlers', () => {
  it.each([
    ['cascade', runCascade],
    ['digest', runDigest],
  ])('fails closed when CRON_SECRET is missing for %s', async (_name, handler) => {
    delete process.env.CRON_SECRET;

    const response = await handler(cronRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'CRON_SECRET not configured' });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it('returns the complete cascade sweep summary', async () => {
    const response = await runCascade(cronRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      smsAccepted: 0,
      notificationEmailsSent: 0,
      eventsAdvanced: 2,
      suggestionsClosed: 3,
      pollsResolved: 4,
      remindersSent: 5,
      signalsDeleted: 6,
      momentsClosed: 7,
      liveLocationsDeleted: 8,
    });
  });

  it('runs the digest behind the shared auth and rate-limit gates', async () => {
    const response = await runDigest(cronRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sent: 9 });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('cron:digest', 5, 60);
    expect(mocks.sweepDigests).toHaveBeenCalledTimes(1);
  });
});
