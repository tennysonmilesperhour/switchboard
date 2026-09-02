import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const after = vi.fn();
  const extractItems = vi.fn();
  const messageSingle = vi.fn();
  const messageSelect = vi.fn(() => ({ single: messageSingle }));
  const messageInsert = vi.fn(() => ({ select: messageSelect }));
  const roomMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
  const roomEq = vi.fn(() => ({ maybeSingle: roomMaybeSingle }));
  const roomSelect = vi.fn(() => ({ eq: roomEq }));
  const roomItemsInsert = vi.fn(async () => ({ error: null }));
  const userFrom = vi.fn((table: string) => {
    if (table === 'messages') return { insert: messageInsert };
    throw new Error(`Unexpected user table: ${table}`);
  });
  const adminFrom = vi.fn((table: string) => {
    if (table === 'rooms') return { select: roomSelect };
    if (table === 'room_items') return { insert: roomItemsInsert };
    throw new Error(`Unexpected admin table: ${table}`);
  });

  return {
    after,
    checkRateLimit: vi.fn(),
    extractItems,
    messageSingle,
    messageInsert,
    roomItemsInsert,
    userFrom,
    adminFrom,
    notifyRoomActivity: vi.fn(async () => undefined),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({
    ok: true,
    supabase: { from: mocks.userFrom },
    user: { id: 'user-1' },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: mocks.userFrom }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.adminFrom }),
}));
vi.mock('@/lib/ai/extract', () => ({ extractItems: mocks.extractItems }));
vi.mock('@/lib/server/media', () => ({ isOwnPublicStorageUrl: () => true }));
vi.mock('@/lib/server/notify', () => ({
  notifyRoomActivity: mocks.notifyRoomActivity,
}));
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

import { sendMessage } from './rooms';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.messageSingle.mockResolvedValue({
    data: { id: 'message-1' },
    error: null,
  });
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.extractItems.mockResolvedValue([
    {
      kind: 'task',
      title: 'bring ice',
      detail: null,
      url: null,
    },
  ]);
});

describe('sendMessage', () => {
  it('returns after the message insert and runs extraction in after()', async () => {
    const result = await sendMessage('room-1', '  I’ll bring ice  ');

    expect(result).toEqual({ ok: true });
    expect(mocks.messageInsert).toHaveBeenCalledWith({
      room_id: 'room-1',
      sender_id: 'user-1',
      body: 'I’ll bring ice',
    });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.extractItems).not.toHaveBeenCalled();
    expect(mocks.roomItemsInsert).not.toHaveBeenCalled();

    const background = mocks.after.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    expect(background).toBeTypeOf('function');
    await background?.();

    expect(mocks.checkRateLimit).toHaveBeenCalledWith('ai:extract:user-1', 60, 3600);
    expect(mocks.extractItems).toHaveBeenCalledWith('I’ll bring ice');
    expect(mocks.roomItemsInsert).toHaveBeenCalledWith([
      {
        room_id: 'room-1',
        message_id: 'message-1',
        kind: 'task',
        title: 'bring ice',
        detail: null,
        url: null,
        created_by: 'user-1',
      },
    ]);
  });
});
