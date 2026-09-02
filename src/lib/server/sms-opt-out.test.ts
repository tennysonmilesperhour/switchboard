import { beforeEach, describe, expect, test, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: dependencies.createAdminClient,
}));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: dependencies.reportOperationalError,
}));

import { inviteIdsSentBySms, smsOptOutStatus } from './sms-opt-out';

beforeEach(() => {
  dependencies.createAdminClient.mockReset();
  dependencies.reportOperationalError.mockReset();
});

describe('SMS permission checks', () => {
  test.each([
    [{ normalized_number: '+15555550100' }, 'opted_out'],
    [null, 'allowed'],
  ] as const)('maps the suppression lookup result to %s', async (data, expected) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
    dependencies.createAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
    });

    await expect(smsOptOutStatus('+15555550100')).resolves.toBe(expected);
  });

  test('fails closed when the suppression store cannot be checked', async () => {
    dependencies.createAdminClient.mockImplementation(() => {
      throw new Error('database unavailable');
    });

    await expect(smsOptOutStatus('+15555550100')).resolves.toBe('unavailable');
    expect(dependencies.reportOperationalError).toHaveBeenCalledWith(
      'sms.opt-out-check',
      expect.any(Error),
    );
  });

  test('returns only invites with a successful recorded SMS delivery', async () => {
    const finalEq = vi.fn().mockResolvedValue({
      data: [{ invite_id: 'invite-sms-1' }, { invite_id: 'invite-sms-2' }],
      error: null,
    });
    dependencies.createAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          in: () => ({
            eq: () => ({ eq: finalEq }),
          }),
        }),
      }),
    });

    await expect(inviteIdsSentBySms([
      'invite-sms-1',
      'invite-email',
      'invite-sms-2',
    ])).resolves.toEqual(new Set(['invite-sms-1', 'invite-sms-2']));
  });
});
