import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Settings writes whose input shape is a decision, not just a pass-through.
 *
 * Quiet hours: a window needs both ends. With one side left Off, push treated
 * quiet hours as switched off entirely while SMS filled the missing side with
 * its 10pm/8am default, so the two channels went quiet at different times —
 * and the save reported success.
 */

const mocks = vi.hoisted(() => {
  const update = vi.fn();
  const eq = vi.fn(async () => ({ error: null }));
  update.mockImplementation(() => ({ eq }));
  return { update, eq };
});

vi.mock('@/lib/server/require-user', () => ({
  requireUser: vi.fn(),
  requireUserOrRedirect: vi.fn(async () => ({
    user: { id: 'user-1' },
    supabase: { from: () => ({ update: mocks.update }) },
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  hasAdminCredentials: () => false,
}));
vi.mock('@/lib/analytics/server', () => ({ capture: vi.fn() }));
vi.mock('@/lib/server/passport', () => ({ loadPassport: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(),
  reportOperationalError: vi.fn(),
}));

import { updateQuietHours } from './profile';

function form(start: string, end: string): FormData {
  const data = new FormData();
  data.set('quiet_start', start);
  data.set('quiet_end', end);
  return data;
}

beforeEach(() => {
  mocks.update.mockClear();
  mocks.eq.mockClear();
});

describe('updateQuietHours', () => {
  it('saves a window that wraps midnight', async () => {
    expect(await updateQuietHours(form('22', '7'))).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ quiet_hours_start: 22, quiet_hours_end: 7 });
  });

  it('saves both ends Off as quiet hours off', async () => {
    expect(await updateQuietHours(form('', ''))).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ quiet_hours_start: null, quiet_hours_end: null });
  });

  it.each([
    ['22', ''],
    ['', '7'],
  ])('refuses a window with only one end (%s → %s) instead of saving it', async (start, end) => {
    const result = await updateQuietHours(form(start, end));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/both a start and an end/);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses an empty window', async () => {
    const result = await updateQuietHours(form('8', '8'));
    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps midnight as a real hour, not Off', async () => {
    expect(await updateQuietHours(form('0', '6'))).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ quiet_hours_start: 0, quiet_hours_end: 6 });
  });
});
