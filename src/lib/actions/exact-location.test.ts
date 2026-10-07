import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The "Find each other" actions. The database decides who may share and who may
 * see (supabase/tests/exact_location.test.sql); these pin what the actions add:
 * input checks before the database, the refusal wording, the rate limits, and
 * that turning it on tells the other person in the chat.
 */

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  rpc: vi.fn(),
  checkRateLimit: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/actions/rooms', () => ({ sendMessage: mocks.sendMessage }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    rpc: mocks.rpc,
  }),
}));

import { EXACT_NOT_ALLOWED, EXACT_STARTED_MESSAGE } from '@/lib/exact-location';
import {
  getExactLocations,
  shareExactLocation,
  stopExactLocation,
} from './exact-location';

const ROOM = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  mocks.user = { id: 'user-1' };
  mocks.rpc.mockReset();
  mocks.checkRateLimit.mockReset().mockResolvedValue(true);
  mocks.sendMessage.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('shareExactLocation', () => {
  it('starts a share with the exact point, unrounded, and tells the other person', async () => {
    mocks.rpc.mockResolvedValue({ data: 'shared', error: null });
    const result = await shareExactLocation(ROOM, 40.712776, -74.005974, 4, true);
    expect(result).toEqual({ ok: true, status: 'shared' });
    expect(mocks.rpc).toHaveBeenCalledWith('share_exact_location', {
      p_room: ROOM,
      p_latitude: 40.712776,
      p_longitude: -74.005974,
      p_accuracy_m: 4,
      p_restart: true,
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(ROOM, EXACT_STARTED_MESSAGE);
  });

  it('does not post to the chat on a position update', async () => {
    mocks.rpc.mockResolvedValue({ data: 'shared', error: null });
    await shareExactLocation(ROOM, 40.7, -74, 4, false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('reports a share that has ended so the screen can stop following', async () => {
    mocks.rpc.mockResolvedValue({ data: 'not_sharing', error: null });
    expect(await shareExactLocation(ROOM, 40.7, -74, null, false)).toEqual({
      ok: true,
      status: 'not_sharing',
    });
  });

  it('says the same thing for every reason the room is closed to it', async () => {
    mocks.rpc.mockResolvedValue({ data: 'not_allowed', error: null });
    expect(await shareExactLocation(ROOM, 40.7, -74, 4, true)).toEqual({
      ok: false,
      error: EXACT_NOT_ALLOWED,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('never sends an impossible coordinate or a malformed room id', async () => {
    expect((await shareExactLocation(ROOM, 95, -74, 4, true)).ok).toBe(false);
    expect((await shareExactLocation('not-a-room', 40.7, -74, 4, true)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('drops a nonsense accuracy rather than storing it', async () => {
    mocks.rpc.mockResolvedValue({ data: 'shared', error: null });
    await shareExactLocation(ROOM, 40.7, -74, Number.NaN, false);
    expect(mocks.rpc.mock.calls[0][1].p_accuracy_m).toBeUndefined();
  });

  it('is rate limited per person', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    const result = await shareExactLocation(ROOM, 40.7, -74, 4, false);
    expect(result.ok).toBe(false);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('exact-share:user-1', expect.any(Number), 3600);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('carries a code when the database fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await shareExactLocation(ROOM, 40.7, -74, 4, true);
    expect(result).toMatchObject({ ok: false, code: 'SB-LOCATION-SAVE' });
  });
});

describe('stopExactLocation', () => {
  it('stops the caller’s share', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await stopExactLocation(ROOM)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('stop_exact_location', { p_room: ROOM });
  });
});

describe('getExactLocations', () => {
  it('maps the rows the database returns', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          user_id: 'user-1',
          latitude: 40.712776,
          longitude: -74.005974,
          accuracy_m: 5,
          updated_at: '2026-10-08T12:00:00Z',
          expires_at: '2026-10-08T13:00:00Z',
          is_me: true,
        },
      ],
      error: null,
    });
    const result = await getExactLocations(ROOM);
    expect(mocks.rpc).toHaveBeenCalledWith('exact_locations_in_room', { p_room: ROOM });
    expect(result.points).toEqual([
      {
        userId: 'user-1',
        latitude: 40.712776,
        longitude: -74.005974,
        accuracyM: 5,
        updatedAt: '2026-10-08T12:00:00Z',
        expiresAt: '2026-10-08T13:00:00Z',
        isMe: true,
      },
    ]);
  });

  it('carries a code when the read fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await getExactLocations(ROOM)).toMatchObject({ ok: false, code: 'SB-LOCATION-LOAD' });
  });
});
