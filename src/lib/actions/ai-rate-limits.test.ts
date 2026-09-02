import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  discoverActivities: vi.fn(),
  parsePlan: vi.fn(),
  extractItems: vi.fn(),
  notifyRoomActivity: vi.fn(),
}));

const messageBuilder = {
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
};
messageBuilder.insert.mockReturnValue(messageBuilder);
messageBuilder.select.mockReturnValue(messageBuilder);

const userClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn((table: string) => {
    if (table === 'messages') return messageBuilder;
    throw new Error(`Unexpected user table: ${table}`);
  }),
};

const roomBuilder = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
roomBuilder.select.mockReturnValue(roomBuilder);
roomBuilder.eq.mockReturnValue(roomBuilder);

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => userClient,
}));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({
    ok: true,
    user: { id: 'user-1' },
    supabase: userClient,
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => roomBuilder }),
}));
vi.mock('@/lib/ai/discovery', () => ({
  discoverActivities: mocks.discoverActivities,
}));
vi.mock('@/lib/ai/plan-parser', () => ({ parsePlan: mocks.parsePlan }));
vi.mock('@/lib/ai/extract', () => ({ extractItems: mocks.extractItems }));
vi.mock('@/lib/server/notify', () => ({
  notifyRoomActivity: mocks.notifyRoomActivity,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { runDiscovery } from './discovery';
import { parsePlanDescription } from './plan';
import { sendMessage } from './rooms';

beforeEach(() => {
  vi.clearAllMocks();
  userClient.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
  });
  messageBuilder.insert.mockReturnValue(messageBuilder);
  messageBuilder.select.mockReturnValue(messageBuilder);
  messageBuilder.single.mockResolvedValue({ data: { id: 'message-1' }, error: null });
  roomBuilder.select.mockReturnValue(roomBuilder);
  roomBuilder.eq.mockReturnValue(roomBuilder);
  roomBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.checkRateLimit.mockResolvedValue(false);
});

describe('AI action quotas', () => {
  it('does not call the discovery model after its user quota is exhausted', async () => {
    const result = await runDiscovery({
      location: 'Denver',
      distanceMiles: 10,
      when: 'tonight',
      budget: '$',
      groupSize: 'solo',
      vibes: [],
      interests: [],
    });

    expect(result.ok).toBe(false);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'ai:discovery:user-1',
      20,
      3600,
    );
    expect(mocks.discoverActivities).not.toHaveBeenCalled();
  });

  it('does not call the plan parser after its user quota is exhausted', async () => {
    const result = await parsePlanDescription('Dinner tomorrow at seven');

    expect(result.ok).toBe(false);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'ai:plan:user-1',
      30,
      3600,
    );
    expect(mocks.parsePlan).not.toHaveBeenCalled();
  });

  it('still saves a room message while skipping exhausted background extraction', async () => {
    const result = await sendMessage('room-1', 'Bring snacks');

    expect(result).toEqual({ ok: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'ai:extract:user-1',
      60,
      3600,
    );
    expect(mocks.extractItems).not.toHaveBeenCalled();
  });
});
