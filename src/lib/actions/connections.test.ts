import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  blockInsert: vi.fn(),
  avoidInsert: vi.fn(),
  connectionDeleteOr: vi.fn(),
  connectionSelectOr: vi.fn(),
  connectionInsert: vi.fn(),
  connectionUpdate: vi.fn(),
  circleMemberDelete: vi.fn(),
  notifyUsers: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));

import { blockProfile, giveSpace, sendConnectionRequestToId } from './connections';

const ME = '00000000-0000-0000-0000-000000000001';
const THEM = '00000000-0000-0000-0000-000000000002';

function supabase() {
  return {
    from: (table: string) => {
      if (table === 'profile_blocks') return { insert: mocks.blockInsert };
      if (table === 'profile_avoids') return { insert: mocks.avoidInsert };
      if (table === 'connections') {
        return {
          delete: () => ({ or: mocks.connectionDeleteOr }),
          select: () => ({ or: mocks.connectionSelectOr }),
          insert: mocks.connectionInsert,
          update: (values: unknown) => ({
            eq: (_column: string, id: string) => ({
              select: () => ({ maybeSingle: () => mocks.connectionUpdate(values, id) }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({ data: { id, display_name: 'Sam' } }),
            }),
          }),
        };
      }
      if (table === 'circles') {
        return {
          select: () => ({ eq: async () => ({ data: [{ id: 'circle-1' }] }) }),
        };
      }
      if (table === 'circle_members') {
        return {
          delete: () => ({
            in: (_column: string, ids: string[]) => ({
              eq: (_c: string, member: string) => mocks.circleMemberDelete(ids, member),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    ok: true,
    supabase: supabase(),
    user: { id: '00000000-0000-0000-0000-000000000001' },
  });
  mocks.blockInsert.mockResolvedValue({ error: null });
  mocks.avoidInsert.mockResolvedValue({ error: null });
  mocks.connectionDeleteOr.mockResolvedValue({ error: null });
  mocks.connectionSelectOr.mockResolvedValue({ data: [], error: null });
  mocks.connectionInsert.mockResolvedValue({ error: null });
  mocks.connectionUpdate.mockResolvedValue({ data: { requester_id: THEM }, error: null });
  mocks.circleMemberDelete.mockResolvedValue({ error: null });
});

describe('connection safety actions', () => {
  it('refuses to block the caller before writing anything', async () => {
    const result = await blockProfile(
      '00000000-0000-0000-0000-000000000001',
    );

    expect(result).toEqual({ ok: false, error: 'You cannot block yourself.' });
    expect(mocks.blockInsert).not.toHaveBeenCalled();
  });

  it('treats an existing block as success and removes the old connection', async () => {
    mocks.blockInsert.mockResolvedValue({ error: { code: '23505' } });

    const result = await blockProfile('00000000-0000-0000-0000-000000000002');

    expect(result).toEqual({ ok: true });
    expect(mocks.blockInsert).toHaveBeenCalledWith({
      blocker_id: '00000000-0000-0000-0000-000000000001',
      blocked_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(mocks.connectionDeleteOr).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/people');
  });

  it('ends the connection and circle membership even without a connection id', async () => {
    // A room or profile page blocks without knowing the connection id. That
    // used to leave the two people connected.
    const result = await blockProfile(THEM);

    expect(result).toEqual({ ok: true });
    const filter = mocks.connectionDeleteOr.mock.calls[0][0] as string;
    expect(filter).toContain(`requester_id.eq.${ME},addressee_id.eq.${THEM}`);
    expect(filter).toContain(`requester_id.eq.${THEM},addressee_id.eq.${ME}`);
    expect(mocks.circleMemberDelete).toHaveBeenCalledWith(['circle-1'], THEM);
  });

  it('refuses a malformed id before writing a block', async () => {
    const result = await blockProfile('not-a-uuid');

    expect(result.ok).toBe(false);
    expect(mocks.blockInsert).not.toHaveBeenCalled();
  });

  it('validates give-space ids before touching the database', async () => {
    const result = await giveSpace('not-a-uuid');

    expect(result).toEqual({ ok: false, error: 'Unknown person.' });
    expect(mocks.avoidInsert).not.toHaveBeenCalled();
  });

  it('treats an existing give-space preference as a no-op success', async () => {
    mocks.avoidInsert.mockResolvedValue({ error: { code: '23505' } });

    const result = await giveSpace(
      '00000000-0000-0000-0000-000000000002',
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.avoidInsert).toHaveBeenCalledWith({
      avoider_id: '00000000-0000-0000-0000-000000000001',
      avoided_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/people');
  });
});

describe('connection requests', () => {
  it('accepts their request instead of creating a second one', async () => {
    mocks.connectionSelectOr.mockResolvedValue({
      data: [{ id: 'incoming-1', requester_id: THEM, status: 'pending' }],
      error: null,
    });

    const result = await sendConnectionRequestToId(THEM);

    expect(result).toEqual({ ok: true, connected: true });
    expect(mocks.connectionInsert).not.toHaveBeenCalled();
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({ status: 'accepted' }, 'incoming-1');
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      [THEM],
      expect.objectContaining({ kind: 'connection_accepted' }),
    );
  });

  it('says so when already connected', async () => {
    mocks.connectionSelectOr.mockResolvedValue({
      data: [{ id: 'c-1', requester_id: ME, status: 'accepted' }],
      error: null,
    });

    const result = await sendConnectionRequestToId(THEM);

    expect(result).toEqual({ ok: false, error: 'You’re already connected.' });
    expect(mocks.connectionInsert).not.toHaveBeenCalled();
  });

  it('does not re-send while their own request is still pending', async () => {
    mocks.connectionSelectOr.mockResolvedValue({
      data: [{ id: 'c-1', requester_id: ME, status: 'pending' }],
      error: null,
    });

    const result = await sendConnectionRequestToId(THEM);

    expect(result).toEqual({ ok: false, error: 'Request already sent' });
    expect(mocks.connectionInsert).not.toHaveBeenCalled();
  });

  it('sends and notifies when the pair has no connection yet', async () => {
    const result = await sendConnectionRequestToId(THEM);

    expect(result).toEqual({ ok: true });
    expect(mocks.connectionInsert).toHaveBeenCalledWith({ requester_id: ME, addressee_id: THEM });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      [THEM],
      expect.objectContaining({ kind: 'connection_request' }),
    );
  });
});
