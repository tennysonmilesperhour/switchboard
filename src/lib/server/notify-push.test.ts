import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const route = { plans: 'existing', reminders: 'existing' };
  const routeRead: { error: { message: string } | null } = { error: null };
  const sendNotification = vi.fn();
  const setVapidDetails = vi.fn();
  const reportOperationalError = vi.fn(async () => undefined);
  const deleteSubscription = vi.fn(async () => ({ data: null, error: null }));

  return {
    route,
    routeRead,
    sendNotification,
    setVapidDetails,
    reportOperationalError,
    deleteSubscription,
  };
});

vi.mock('web-push', () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails,
  },
}));

vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notification_routes') {
        return {
          select: () => ({
            in: async () =>
              mocks.routeRead.error
                ? { data: null, error: mocks.routeRead.error }
                : { data: [{ user_id: 'user-1', ...mocks.route }], error: null },
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  id: 'user-1',
                  quiet_hours_start: null,
                  quiet_hours_end: null,
                  timezone: 'UTC',
                  notify_plans: true,
                  notify_suggestions: true,
                  notify_reminders: true,
                  notify_messages: true,
                  notify_social: true,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'push_subscriptions') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  id: 'subscription-1',
                  endpoint: 'https://push.example.test/one',
                  p256dh: 'key',
                  auth: 'secret',
                },
              ],
              error: null,
            }),
          }),
          delete: () => ({ eq: mocks.deleteSubscription }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { sendPushToUsers } from './notify';

describe('web-push failure observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports a provider failure without exposing the endpoint or keys', async () => {
    const error = { statusCode: 503, message: 'provider unavailable' };
    mocks.sendNotification.mockRejectedValueOnce(error);

    await sendPushToUsers(['user-1'], { title: 'Hello', body: 'World' });

    expect(mocks.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.test/one',
        keys: { p256dh: 'key', auth: 'secret' },
      },
      JSON.stringify({ title: 'Hello', body: 'World' }),
      { timeout: 10_000 },
    );
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'push.send',
      error,
      { subscriptionId: 'subscription-1', statusCode: 503 },
    );
    expect(mocks.deleteSubscription).not.toHaveBeenCalled();
  });

  it.each([404, 410])(
    'prunes a %s subscription without reporting an operational failure',
    async (statusCode) => {
      mocks.sendNotification.mockRejectedValueOnce({ statusCode });

      await sendPushToUsers(['user-1'], { title: 'Hello', body: 'World' });

      expect(mocks.deleteSubscription).toHaveBeenCalledWith(
        'id',
        'subscription-1',
      );
      expect(mocks.reportOperationalError).not.toHaveBeenCalled();
    },
  );
});

it('channel selection suppresses push for SMS and email preferences', async () => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
  mocks.sendNotification.mockClear();
  mocks.route.plans = 'sms';
  await sendPushToUsers(['user-1'], { title: 'Plan', body: 'Changed' }, 'plans');
  mocks.route.plans = 'email';
  await sendPushToUsers(['user-1'], { title: 'Plan', body: 'Changed' }, 'plans');
  expect(mocks.sendNotification).not.toHaveBeenCalled();
  mocks.route.plans = 'existing';
});

it('an unreadable route skips the push and reports it instead of throwing into the caller', async () => {
  // Every domain action awaits notifyUsers after its own write committed, so a
  // throw here used to turn a saved RSVP into an error screen.
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
  mocks.sendNotification.mockClear();
  mocks.reportOperationalError.mockClear();
  mocks.routeRead.error = { message: 'relation unavailable' };
  try {
    await expect(
      sendPushToUsers(['user-1'], { title: 'Plan', body: 'Changed' }, 'plans'),
    ).resolves.toBeUndefined();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'push.send',
      mocks.routeRead.error,
      { stage: 'routes', category: 'plans' },
    );
  } finally {
    mocks.routeRead.error = null;
    vi.unstubAllEnvs();
  }
});
