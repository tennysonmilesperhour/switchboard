import { beforeEach, describe, expect, it, vi } from 'vitest';

const ME = '00000000-0000-0000-0000-000000000001';
const FRIEND = '00000000-0000-0000-0000-000000000002';
const STRANGER = '00000000-0000-0000-0000-000000000003';
const OLD_MEMBER = '00000000-0000-0000-0000-000000000004';
const HOUSEHOLD = '00000000-0000-0000-0000-0000000000a1';

const mocks = vi.hoisted(() => ({
  household: vi.fn(),
  insert: vi.fn(),
  deleteIn: vi.fn(),
  connections: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed' })),
}));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({
    ok: true,
    user: { id: '00000000-0000-0000-0000-000000000001' },
    supabase: {
      from: (table: string) => {
        if (table === 'households') {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({ data: mocks.household() }),
          };
          return chain;
        }
        if (table === 'connections') {
          return {
            select: () => ({
              eq: () => ({ or: async () => ({ data: mocks.connections() }) }),
            }),
          };
        }
        if (table === 'household_members') {
          return {
            insert: mocks.insert,
            delete: () => ({
              eq: () => ({ in: (_c: string, ids: string[]) => mocks.deleteIn(ids) }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    },
  }),
}));

import { updateHouseholdMembers } from './households';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.household.mockReturnValue({
    id: HOUSEHOLD,
    household_members: [{ member_id: OLD_MEMBER }],
  });
  mocks.connections.mockReturnValue([
    { requester_id: ME, addressee_id: FRIEND },
  ]);
  mocks.insert.mockResolvedValue({ error: null });
  mocks.deleteIn.mockResolvedValue({ error: null });
});

describe('updateHouseholdMembers (P9)', () => {
  it('adds connections and removes whoever was taken out', async () => {
    const result = await updateHouseholdMembers(HOUSEHOLD, [FRIEND]);

    expect(result).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledWith([{ household_id: HOUSEHOLD, member_id: FRIEND }]);
    expect(mocks.deleteIn).toHaveBeenCalledWith([OLD_MEMBER]);
  });

  it('never files someone the owner is not connected to', async () => {
    const result = await updateHouseholdMembers(HOUSEHOLD, [OLD_MEMBER, STRANGER]);

    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('refuses to empty a household', async () => {
    const result = await updateHouseholdMembers(HOUSEHOLD, []);

    expect(result.ok).toBe(false);
    expect(mocks.deleteIn).not.toHaveBeenCalled();
  });

  it('says so when the household is not the caller’s', async () => {
    mocks.household.mockReturnValue(null);

    const result = await updateHouseholdMembers(HOUSEHOLD, [FRIEND]);

    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
