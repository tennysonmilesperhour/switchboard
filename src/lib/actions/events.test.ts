import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireUserOrRedirect: vi.fn(),
  isEventManager: vi.fn(),
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: mocks.requireUser,
  requireUserOrRedirect: mocks.requireUserOrRedirect,
}));
vi.mock('@/lib/server/authz', () => ({
  isEventManager: mocks.isEventManager,
  checkEventManager: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/server/cascade-runner', () => ({
  advanceEventCascade: vi.fn(),
  deliverInviteNow: vi.fn(),
  notifyCurrentInviteWave: vi.fn(),
}));
vi.mock('@/lib/server/relationship', () => ({ getRelationship: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ capture: vi.fn() }));
vi.mock('@/lib/server/media', () => ({ isValidMediaRef: vi.fn(() => true) }));
vi.mock('@/lib/server/email', () => ({
  looksLikeEmail: vi.fn(() => false),
  sendEmails: vi.fn(),
}));
vi.mock('@/lib/server/sms', () => ({
  looksLikePhoneNumber: vi.fn(() => false),
  sendSmsMessages: vi.fn(),
}));
vi.mock('@/lib/server/geocode', () => ({ geocode: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(),
  reportOperationalError: mocks.reportOperationalError,
}));

import {
  addPeopleToEvent,
  cancelEvent,
  deleteEventPermanently,
} from './events';

beforeEach(() => {
  vi.clearAllMocks();
  const supabase = { rpc: mocks.rpc };
  mocks.requireUser.mockResolvedValue({
    ok: true,
    supabase,
    user: { id: 'user-1' },
  });
  mocks.requireUserOrRedirect.mockResolvedValue({
    supabase,
    user: { id: 'user-1' },
  });
  mocks.isEventManager.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: 'deleted', error: null });
  mocks.createAdminClient.mockImplementation(() => {
    throw new Error('Admin client should not be reached');
  });
});

describe('event management actions', () => {
  it('refuses addPeopleToEvent before any privileged read for a non-manager', async () => {
    mocks.isEventManager.mockResolvedValue(false);

    const result = await addPeopleToEvent('event-1', {
      profileIds: ['person-1'],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'SB-PERM-HOST',
      error: 'Only the host can add people.',
    });
    expect(mocks.isEventManager).toHaveBeenCalledWith('user-1', 'event-1');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('refuses cancellation before any privileged read for a non-manager', async () => {
    mocks.isEventManager.mockResolvedValue(false);

    await expect(cancelEvent('event-1', 'Changed plans')).resolves.toBeUndefined();

    expect(mocks.isEventManager).toHaveBeenCalledWith('user-1', 'event-1');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('requires cancellation before permanently deleting accepted guests', async () => {
    mocks.rpc.mockResolvedValue({ data: 'accepted_guests', error: null });

    const result = await deleteEventPermanently('event-1');

    expect(mocks.rpc).toHaveBeenCalledWith('delete_hosted_event_permanently', {
      p_event: 'event-1',
    });
    expect(result).toEqual({
      ok: false,
      error: 'Cancel the plan first so everyone who accepted is notified.',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates both plan surfaces after permanent deletion', async () => {
    const result = await deleteEventPermanently('event-1');

    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/plans');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
  });
});
