import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Memory Capsule takes lines from people who went and the plan's hosts
 * (G28). The database decides; this pins what the writer is told when it says
 * no, and that a real failure still carries its code.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  upsert: vi.fn(),
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed' })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/server/observability', () => ({ reportAndFail: mocks.reportAndFail }));

import { addCapsuleEntry } from './capsules';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    ok: true,
    user: { id: 'user-1' },
    supabase: { from: () => ({ upsert: mocks.upsert }) },
  });
});

describe('addCapsuleEntry', () => {
  it('saves a line from someone the policy lets write', async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    await expect(addCapsuleEntry('event-1', 'Best night', '')).resolves.toEqual({ ok: true });
  });

  it('tells someone who did not go why their line was refused, without a code', async () => {
    mocks.upsert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });

    const result = await addCapsuleEntry('event-1', 'Wish I had been there', '');

    expect(result).toEqual({
      ok: false,
      error: 'Only people who went, and the plan’s hosts, can add to the capsule.',
    });
    expect(mocks.reportAndFail).not.toHaveBeenCalled();
  });

  it('reports any other failure with its code', async () => {
    mocks.upsert.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } });

    const result = await addCapsuleEntry('event-1', 'Best night', '');

    expect(result).toMatchObject({ ok: false, code: 'SB-CAPSULE-SAVE' });
  });
});
