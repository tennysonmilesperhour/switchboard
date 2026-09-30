import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const route = { plans: 'existing', reminders: 'existing' };
  const profile: Record<string, unknown> = {};
  const routeRead: { error: { message: string } | null } = { error: null };
  const sendNotification = vi.fn();
  const setVapidDetails = vi.fn();
  const reportOperationalError = vi.fn(async () => undefined);
  const deleteSubscription = vi.fn(async () => ({ data: null, error: null }));

  return {
    route,
    profile,
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
                  ...mocks.profile,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'push_subscriptions') {
        const rows = async () => ({
          data: [
            {
              id: 'subscription-1',
              endpoint: 'https://push.example.test/one',
              p256dh: 'key',
              auth: 'secret',
            },
          ],
          error: null,
        });
        return {
          select: () => ({ in: rows, eq: rows }),
          delete: () => ({ eq: mocks.deleteSubscription }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { heldForDigest, pushDigest, sendPushToUsers } from './notify';

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

describe('the daily digest (D16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
  });

  afterEach(() => {
    for (const key of Object.keys(mocks.profile)) delete mocks.profile[key];
    vi.unstubAllEnvs();
  });

  it('holds everything but plan changes, invitations and reminders for someone who chose it', () => {
    for (const kind of ['event_invite', 'event_updated', 'event_urgent_change', 'event_cancelled', 'event_date_set', 'reminder']) {
      expect(heldForDigest(kind, true), kind).toBe(false);
    }
    for (const kind of ['room_message', 'rsvp_accepted', 'join_request', 'poll_suggestion', 'match', 'announcement']) {
      expect(heldForDigest(kind, true), kind).toBe(true);
    }
    expect(heldForDigest('room_message', false)).toBe(false);
    expect(heldForDigest(undefined, true)).toBe(false);
  });

  it('skips the per-item push the digest will carry, and still sends a plan change', async () => {
    // sendPushToUsers never read digest_enabled, so turning the digest on
    // added a summary on top of every buzz instead of replacing them.
    mocks.profile.digest_enabled = true;
    await sendPushToUsers(['user-1'], { title: 'New message', body: 'x' }, 'messages', {
      kind: 'room_message',
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();

    await sendPushToUsers(['user-1'], { title: 'Moved', body: 'x' }, 'plans', {
      kind: 'event_updated',
    });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('pushes the digest inside quiet hours and reports that it arrived', async () => {
    mocks.profile.quiet_hours_start = 0;
    mocks.profile.quiet_hours_end = 23;
    mocks.sendNotification.mockResolvedValueOnce({});
    await expect(pushDigest('user-1', { title: 'Your day', body: '3 new messages' })).resolves.toBe(
      'delivered',
    );
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('says a digest push failed when no device took it, so it is not marked sent', async () => {
    mocks.sendNotification.mockRejectedValueOnce({ statusCode: 503 });
    await expect(pushDigest('user-1', { title: 'Your day', body: 'x' })).resolves.toBe('failed');
  });

  it('says push is unavailable when the only subscription is gone, so email can step in', async () => {
    mocks.sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await expect(pushDigest('user-1', { title: 'Your day', body: 'x' })).resolves.toBe(
      'unavailable',
    );
    vi.unstubAllEnvs();
    await expect(pushDigest('user-1', { title: 'Your day', body: 'x' })).resolves.toBe(
      'unavailable',
    );
  });
});

describe('sabbatical (D6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
    mocks.profile.sabbatical = true;
  });

  afterEach(() => {
    for (const key of Object.keys(mocks.profile)) delete mocks.profile[key];
    vi.unstubAllEnvs();
  });

  it('holds the push for anything that is not a plan they are already in', async () => {
    for (const kind of ['event_invite', 'connection_request', 'match', 'ritual']) {
      await sendPushToUsers(['user-1'], { title: 'x', body: 'x' }, undefined, { kind });
    }
    await sendPushToUsers(['user-1'], { title: 'x', body: 'x' });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('still pushes a change or a message from a plan they are in', async () => {
    await sendPushToUsers(['user-1'], { title: 'Moved', body: 'x' }, 'plans', { kind: 'event_updated' });
    await sendPushToUsers(['user-1'], { title: 'Hi', body: 'x' }, 'messages', {
      kind: 'room_message',
      planRoom: true,
    });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('holds a message from a room that is not a plan’s', async () => {
    await sendPushToUsers(['user-1'], { title: 'Hi', body: 'x' }, 'messages', {
      kind: 'room_message',
      planRoom: false,
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});
