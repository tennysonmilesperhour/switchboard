import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  requestClientIp: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock('@/lib/server/request-ip', () => ({
  requestClientIp: mocks.requestClientIp,
}));

import { guardAuthAttempt } from './auth-rate-limit';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestClientIp.mockResolvedValue('203.0.113.7');
  mocks.checkRateLimit.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guardAuthAttempt', () => {
  it('checks independent IP and identifier buckets in fail-closed mode', async () => {
    await expect(guardAuthAttempt('signin', 'alice@example.com')).resolves.toEqual({
      allowed: true,
      backedOff: false,
    });

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'signin:ip:203.0.113.7',
      30,
      600,
      { failClosed: true },
    );
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'signin:identifier:alice@example.com',
      20,
      600,
      { failClosed: true },
    );
  });

  it('hard-stops an exhausted IP bucket', async () => {
    mocks.checkRateLimit.mockImplementation(async (key: string) =>
      !key.includes(':ip:'),
    );

    await expect(guardAuthAttempt('signup', 'alice@example.com')).resolves.toEqual({
      allowed: false,
      backedOff: false,
    });
  });

  it('backs off but never locks an account when only its identifier is hot', async () => {
    vi.useFakeTimers();
    mocks.checkRateLimit.mockImplementation(async (key: string) =>
      !key.includes(':identifier:'),
    );

    const decision = guardAuthAttempt('signin', 'alice@example.com');
    await vi.advanceTimersByTimeAsync(750);

    await expect(decision).resolves.toEqual({ allowed: true, backedOff: true });
  });
});
