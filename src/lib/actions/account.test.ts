import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), send: vi.fn(), remove: vi.fn(), signOut: vi.fn(),
  requireUser: vi.fn(), admin: {},
}));
vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: () => true, createAdminClient: () => mocks.admin,
}));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/server/hosted-plans', () => ({
  prepareHostedPlanCancellations: mocks.prepare, sendHostedPlanCancellations: mocks.send,
}));
vi.mock('@/lib/server/account-data', () => ({
  deleteAccountAndData: mocks.remove, buildMyDataExport: vi.fn(), serializeMyDataExport: vi.fn(),
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code })),
}));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { deleteAccount } from './account';

const snapshot = { planCount: 1, members: [], emails: [] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({
    ok: true, user: { id: 'departing-user' }, supabase: { auth: { signOut: mocks.signOut } },
  });
  mocks.prepare.mockResolvedValue(snapshot);
  mocks.remove.mockResolvedValue({});
});

describe('account-deletion notification ordering', () => {
  it('snapshots before deleting and sends only after deletion succeeds', async () => {
    await expect(deleteAccount('DELETE')).rejects.toThrow('redirect:/welcome?account=deleted');
    expect(mocks.prepare).toHaveBeenCalledWith(mocks.admin, 'departing-user');
    expect(mocks.remove).toHaveBeenCalledWith(mocks.admin, 'departing-user');
    expect(mocks.send).toHaveBeenCalledWith(snapshot);
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it.each(['storage cleanup failed', 'auth deletion failed'])(
    'sends no cancellation notices when %s', async (message) => {
      mocks.remove.mockRejectedValue(new Error(message));
      await expect(deleteAccount('DELETE')).resolves.toMatchObject({ ok: false, code: 'SB-AUTH-DELETE' });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
    },
  );

  it('does not repeat notices when a retry cannot delete an already-deleted user', async () => {
    await expect(deleteAccount('DELETE')).rejects.toThrow('redirect:');
    mocks.remove.mockRejectedValue(new Error('User not found'));
    await deleteAccount('DELETE');
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it('still signs out after a delivery failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.send.mockRejectedValue(new Error('Provider unavailable'));
    await expect(deleteAccount('DELETE')).rejects.toThrow('redirect:/welcome?account=deleted');
    expect(mocks.signOut).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it('does not prevent deletion if its recipient snapshot fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.prepare.mockRejectedValue(new Error('Recipient read failed'));
    await expect(deleteAccount('DELETE')).rejects.toThrow('redirect:/welcome?account=deleted');
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
