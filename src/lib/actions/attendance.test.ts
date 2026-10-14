import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Still coming?" before an Open Table. `confirm_attendance` decides whose seat
 * it is and who takes a seat given back (supabase/tests/attendance_check.test.sql).
 * These tests pin what the action does with that: a refusal is one message, a
 * yes tells nobody, and a seat given back tells the host and the person who got
 * it without ever handing that person's id to the browser.
 */

const INVITE = '00000000-0000-4000-8000-00000000c101';
const PROMOTED = '00000000-0000-4000-8000-00000000c103';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  notifyUsers: vi.fn(),
  adminRows: new Map<string, unknown>(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/server/observability', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/server/observability')>();
  return { ...actual, reportOperationalError: vi.fn() };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'guest' } }, error: null }) },
    rpc: mocks.rpc,
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      let id = '';
      const chain = {
        select: () => chain,
        eq: (_column: string, value: string) => {
          id = value;
          return chain;
        },
        maybeSingle: async () => ({ data: mocks.adminRows.get(id) ?? null, error: null }),
      };
      return chain;
    },
  }),
}));

import { confirmAttendance } from './attendance';

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.notifyUsers.mockReset();
  mocks.adminRows.clear();
  mocks.adminRows.set(INVITE, { event_id: 'e1', event: { id: 'e1', title: 'Supper', host_id: 'host' } });
  mocks.adminRows.set(PROMOTED, { invitee_id: 'waiting' });
});

describe('confirmAttendance', () => {
  it('refuses a malformed id before calling the database', async () => {
    expect((await confirmAttendance('nope', true)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('says one thing when the window closed or the seat is not yours', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } });
    const result = await confirmAttendance(INVITE, true);
    expect('code' in result && result.code).toBe('SB-SEAT-SAVE');
  });

  it('tells nobody when a guest confirms', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ outcome: 'confirmed', promoted_invite: null }], error: null });
    expect(await confirmAttendance(INVITE, true)).toEqual({ ok: true, outcome: 'confirmed' });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('tells the host and the person who got the seat, and returns neither id', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ outcome: 'released', promoted_invite: PROMOTED }], error: null });
    const result = await confirmAttendance(INVITE, false);
    expect(result).toEqual({ ok: true, outcome: 'released' });
    expect(JSON.stringify(result)).not.toContain(PROMOTED);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['host'], expect.objectContaining({ kind: 'seat_released' }));
    expect(mocks.notifyUsers).toHaveBeenCalledWith(['waiting'], expect.objectContaining({ kind: 'seat_opened' }));
  });

  it('tells only the host when nobody was waiting', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ outcome: 'released', promoted_invite: null }], error: null });
    await confirmAttendance(INVITE, false);
    expect(mocks.notifyUsers).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['host'],
      expect.objectContaining({ body: expect.stringContaining('nobody was waiting') }),
    );
  });
});
