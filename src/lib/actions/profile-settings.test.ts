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
  /** Tables a row was deleted from, with the column and value it was scoped to. */
  const deleted: Array<[string, string, unknown]> = [];
  const from = (table: string) => ({
    update,
    delete: () => ({
      eq: async (column: string, value: unknown) => {
        deleted.push([table, column, value]);
        return { error: null };
      },
    }),
  });
  return { update, eq, deleted, from };
});

vi.mock('@/lib/server/require-user', () => ({
  requireUser: vi.fn(),
  requireUserOrRedirect: vi.fn(async () => ({
    user: { id: 'user-1' },
    supabase: { from: mocks.from },
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

import { updateQuietHours, updateSabbatical } from './profile';

function form(start: string, end: string): FormData {
  const data = new FormData();
  data.set('quiet_start', start);
  data.set('quiet_end', end);
  return data;
}

beforeEach(() => {
  mocks.update.mockClear();
  mocks.eq.mockClear();
  mocks.deleted.length = 0;
});

describe('updateSabbatical', () => {
  function sabbatical(on: boolean): FormData {
    const data = new FormData();
    if (on) data.set('sabbatical', 'on');
    return data;
  }

  it('takes down the live signal and the live location share when it starts', async () => {
    expect(await updateSabbatical(sabbatical(true))).toEqual({ ok: true });
    expect(mocks.deleted).toEqual(
      expect.arrayContaining([
        ['availability_signals', 'user_id', 'user-1'],
        ['live_locations', 'user_id', 'user-1'],
      ]),
    );
  });

  it('deletes nothing when it ends', async () => {
    expect(await updateSabbatical(sabbatical(false))).toEqual({ ok: true });
    expect(mocks.deleted).toEqual([]);
  });
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

  it('saves the time zone the hours are read in', async () => {
    // It used to be set once at onboarding and never shown again, so quiet
    // hours could fall at the wrong time with no way to see why (G13).
    const data = form('22', '7');
    data.set('timezone', 'America/Chicago');
    expect(await updateQuietHours(data)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({
      quiet_hours_start: 22,
      quiet_hours_end: 7,
      timezone: 'America/Chicago',
    });
  });

  it('refuses a zone Intl does not know rather than quietly saving UTC', async () => {
    const data = form('22', '7');
    data.set('timezone', 'Mars/Olympus_Mons');
    const result = await updateQuietHours(data);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/time zone/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
