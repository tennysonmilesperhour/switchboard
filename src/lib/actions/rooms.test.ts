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
  const messageDeleteSelect = vi.fn();
  const messageDelete = vi.fn(() => {
    const chain = {
      eq: vi.fn(() => chain),
      select: messageDeleteSelect,
    };
    return chain;
  });
  const userRoomItemsDelete = vi.fn(() => {
    const chain: { eq: ReturnType<typeof vi.fn> } = { eq: vi.fn(() => chain) };
    return chain;
  });
  const userRpc = vi.fn();
  // Reading one message before reporting it.
  const messageMaybeSingle = vi.fn();
  const messageRead = vi.fn(() => {
    const chain = { eq: vi.fn(() => chain), maybeSingle: messageMaybeSingle };
    return chain;
  });
  const reportInsert = vi.fn();
  const userFrom = vi.fn((table: string) => {
    if (table === 'messages') {
      return { insert: messageInsert, delete: messageDelete, select: messageRead };
    }
    if (table === 'room_items') return { delete: userRoomItemsDelete };
    if (table === 'user_reports') return { insert: reportInsert };
    throw new Error(`Unexpected user table: ${table}`);
  });
  // Whether a deleted photo is held by a report (the count the admin reads).
  const reportedPhotoCount = vi.fn();
  const adminFrom = vi.fn((table: string) => {
    if (table === 'rooms') return { select: roomSelect };
    if (table === 'room_items') return { insert: roomItemsInsert };
    if (table === 'user_reports') {
      return {
        select: () => {
          const chain = {
            eq: vi.fn(() => chain),
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(reportedPhotoCount()).then(resolve),
          };
          return chain;
        },
      };
    }
    throw new Error(`Unexpected admin table: ${table}`);
  });

  return {
    after,
    checkRateLimit: vi.fn(),
    extractItems,
    messageSingle,
    messageInsert,
    messageDeleteSelect,
    roomItemsInsert,
    userFrom,
    userRpc,
    adminFrom,
    messageMaybeSingle,
    reportInsert,
    reportedPhotoCount,
    storageRemove: vi.fn(async () => ({ error: null })),
    notifyRoomActivity: vi.fn(async () => undefined),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({
    ok: true,
    supabase: { from: mocks.userFrom, rpc: mocks.userRpc },
    user: { id: 'user-1' },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: mocks.userFrom }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  hasAdminCredentials: () => true,
  createAdminClient: () => ({
    from: mocks.adminFrom,
    storage: { from: () => ({ remove: mocks.storageRemove }) },
  }),
}));
vi.mock('@/lib/ai/extract', () => ({ extractItems: mocks.extractItems }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed' })),
}));
vi.mock('@/lib/server/notify', () => ({
  notifyRoomActivity: mocks.notifyRoomActivity,
}));
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

import {
  deleteMessage,
  leaveRoom,
  reportRoomMessage,
  sendMessage,
  sendPhotoMessage,
} from './rooms';

const REPORTED = '00000000-0000-0000-0000-0000000000aa';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.messageSingle.mockResolvedValue({
    data: { id: 'message-1' },
    error: null,
  });
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.userRpc.mockResolvedValue({ data: false, error: null });
  mocks.messageDeleteSelect.mockResolvedValue({ data: [], error: null });
  mocks.reportedPhotoCount.mockReturnValue({ count: 0, error: null });
  mocks.messageMaybeSingle.mockResolvedValue({
    data: { id: REPORTED, sender_id: 'user-2' },
    error: null,
  });
  mocks.reportInsert.mockResolvedValue({ error: null });
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

  it('refuses a message past the 4,000-character column limit before inserting', async () => {
    const result = await sendMessage('room-1', 'x'.repeat(4001));

    expect(result.ok).toBe(false);
    // Validation, not an operational code: retrying the same text cannot work.
    expect(result).not.toHaveProperty('code');
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });
});

describe('sendMessage in a room a block has closed', () => {
  it('says the room is read-only instead of "reload and try again"', async () => {
    mocks.messageSingle.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' },
    });
    mocks.userRpc.mockResolvedValue({ data: true, error: null });

    const result = await sendMessage('room-1', 'hello?');

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('code');
    expect(result.error).toMatch(/read-only/);
    expect(mocks.userRpc).toHaveBeenCalledWith('room_is_read_only', { p_room: 'room-1' });
    expect(mocks.notifyRoomActivity).not.toHaveBeenCalled();
  });

  it('still reports a real failure with its code', async () => {
    mocks.messageSingle.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });

    const result = await sendMessage('room-1', 'hello?');

    expect(result).toMatchObject({ ok: false, code: 'SB-ROOM-SAVE' });
  });
});

describe('sendPhotoMessage', () => {
  it('stores a private upload from the sender’s own folder', async () => {
    const result = await sendPhotoMessage('room-1', 'user-1/room-1-abc.jpg');

    expect(result).toEqual({ ok: true });
    expect(mocks.messageInsert).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: 'user-1/room-1-abc.jpg' }),
    );
  });

  it('refuses a path into somebody else’s private folder', async () => {
    const result = await sendPhotoMessage('room-1', 'someone-else/voice-1.webm');

    expect(result.ok).toBe(false);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });

  it('refuses an arbitrary outside URL', async () => {
    const result = await sendPhotoMessage('room-1', 'https://evil.example/x.jpg');

    expect(result.ok).toBe(false);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });
});

describe('deleteMessage', () => {
  const MESSAGE = '00000000-0000-0000-0000-00000000000f';

  it('does not report success when the message was not the caller’s', async () => {
    const result = await deleteMessage(MESSAGE, 'room-1');

    expect(result.ok).toBe(false);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it('removes a deleted photo’s private object too', async () => {
    mocks.messageDeleteSelect.mockResolvedValue({
      data: [{ id: MESSAGE, image_url: 'user-1/room-1-abc.jpg' }],
      error: null,
    });

    const result = await deleteMessage(MESSAGE, 'room-1');

    expect(result).toEqual({ ok: true });
    expect(mocks.storageRemove).toHaveBeenCalledWith(['user-1/room-1-abc.jpg']);
  });

  it('keeps a reported photo in storage, so the moderator can still see it', async () => {
    mocks.messageDeleteSelect.mockResolvedValue({
      data: [{ id: MESSAGE, image_url: 'user-1/room-1-abc.jpg' }],
      error: null,
    });
    mocks.reportedPhotoCount.mockReturnValue({ count: 1, error: null });

    const result = await deleteMessage(MESSAGE, 'room-1');

    expect(result).toEqual({ ok: true });
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it('keeps the photo when it cannot tell whether a report holds it', async () => {
    mocks.messageDeleteSelect.mockResolvedValue({
      data: [{ id: MESSAGE, image_url: 'user-1/room-1-abc.jpg' }],
      error: null,
    });
    mocks.reportedPhotoCount.mockReturnValue({ count: null, error: { message: 'down' } });

    expect(await deleteMessage(MESSAGE, 'room-1')).toEqual({ ok: true });
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });
});

describe('reportRoomMessage', () => {
  it('files a report naming the message, and lets the database attach its contents', async () => {
    const result = await reportRoomMessage(REPORTED, '  cruel  ');

    expect(result).toEqual({ ok: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('report:user-1', 10, 3600);
    expect(mocks.reportInsert).toHaveBeenCalledWith({
      reporter_id: 'user-1',
      reported_id: 'user-2',
      target_kind: 'room_message',
      message_id: REPORTED,
      reason: 'cruel',
    });
  });

  it('asks for a reason before anything else', async () => {
    const result = await reportRoomMessage(REPORTED, '   ');

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('code');
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it('says a message the reporter cannot read is not there', async () => {
    mocks.messageMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await reportRoomMessage(REPORTED, 'cruel');

    expect(result).toMatchObject({ ok: false, code: 'SB-MESSAGE-MISSING' });
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it('does not report your own message', async () => {
    mocks.messageMaybeSingle.mockResolvedValue({
      data: { id: REPORTED, sender_id: 'user-1' },
      error: null,
    });

    const result = await reportRoomMessage(REPORTED, 'oops');

    expect(result.ok).toBe(false);
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });

  it('treats a second report of the same message as the first', async () => {
    mocks.reportInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });

    expect(await reportRoomMessage(REPORTED, 'cruel')).toEqual({ ok: true });
  });

  it('names a message removed between the read and the report', async () => {
    mocks.reportInsert.mockResolvedValue({ error: { code: 'P0002', message: 'message not found' } });

    expect(await reportRoomMessage(REPORTED, 'cruel')).toMatchObject({
      ok: false,
      code: 'SB-MESSAGE-MISSING',
    });
  });

  it('carries its own code when the report does not land', async () => {
    mocks.reportInsert.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } });

    expect(await reportRoomMessage(REPORTED, 'cruel')).toMatchObject({
      ok: false,
      code: 'SB-MESSAGE-REPORT',
    });
  });

  it('is throttled with every other report', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    expect(await reportRoomMessage(REPORTED, 'cruel')).toMatchObject({
      ok: false,
      code: 'SB-RATE-LIMIT',
    });
    expect(mocks.reportInsert).not.toHaveBeenCalled();
  });
});

describe('leaveRoom', () => {
  it('explains that a live plan’s room can only be muted', async () => {
    mocks.userRpc.mockResolvedValue({ data: 'plan_not_over', error: null });

    const result = await leaveRoom('room-1');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/once the plan is over/);
  });

  it('leaves a match room', async () => {
    mocks.userRpc.mockResolvedValue({ data: 'left', error: null });

    expect(await leaveRoom('room-1')).toEqual({ ok: true });
    expect(mocks.userRpc).toHaveBeenCalledWith('leave_room', { p_room: 'room-1' });
  });
});
