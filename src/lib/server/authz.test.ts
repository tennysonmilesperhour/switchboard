import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { checkEventManager, isEventManager } from '@/lib/server/authz';

const USER = '11111111-1111-1111-1111-111111111111';
const EVENT = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
});

/**
 * The distinction this module exists to preserve: "no, they may not" and "we
 * could not find out" are different answers, and collapsing them is how a host
 * came to be told they were not the host of their own plan.
 */
describe('checkEventManager', () => {
  it('answers yes for a host', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await checkEventManager(USER, EVENT)).toEqual({ ok: true, isManager: true });
  });

  it('answers no for someone who does not manage the plan', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await checkEventManager(USER, EVENT)).toEqual({ ok: true, isManager: false });
  });

  it('reports "could not find out" when the RPC errors, not "not a host"', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function is_event_host' },
    });

    const result = await checkEventManager(USER, EVENT);

    expect(result.ok, 'a failed check must not read as a permission verdict').toBe(false);
    expect(result.isManager).toBe(false);
  });

  it('logs the cause when the check fails, so it is not invisible', async () => {
    const error = { message: 'connection terminated unexpectedly' };
    mocks.rpc.mockResolvedValue({ data: null, error });

    await checkEventManager(USER, EVENT);

    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'authz.event-manager',
      error,
      { eventId: EVENT },
    );
  });

  it('survives an unconfigured server rather than throwing into the action', async () => {
    // createAdminClient throws when SUPABASE_SERVICE_ROLE_KEY is absent.
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error('Supabase admin credentials are not configured');
    });

    const result = await checkEventManager(USER, EVENT);

    expect(result).toEqual({ ok: false, isManager: false });
    expect(mocks.reportOperationalError).toHaveBeenCalled();
  });
});

describe('isEventManager', () => {
  it('is true only for an answered yes', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await isEventManager(USER, EVENT)).toBe(true);
  });

  it('fails closed on a refusal', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await isEventManager(USER, EVENT)).toBe(false);
  });

  it('fails closed — never open — when the check itself failed', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await isEventManager(USER, EVENT)).toBe(false);
  });
});
