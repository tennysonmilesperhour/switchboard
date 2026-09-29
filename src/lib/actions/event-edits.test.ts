import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The plan edits D17 and D18 added: the extras a host may change after
 * creation (cover, theme, reminders, Open Table, new questions), and more time
 * for an invitation that is already out. Split from `events.test.ts`, whose
 * mocks these share.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  checkEventManager: vi.fn(),
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: mocks.requireUser,
  requireUserOrRedirect: vi.fn(),
}));
vi.mock('@/lib/server/authz', () => ({ checkEventManager: mocks.checkEventManager }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/server/cascade-runner', () => ({
  advanceEventCascade: vi.fn(),
  deliverInviteNow: vi.fn(),
  notifyCurrentInviteWave: vi.fn(),
}));
vi.mock('@/lib/server/relationship', () => ({ getRelationship: vi.fn() }));
vi.mock('@/lib/server/notify', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ capture: vi.fn() }));
vi.mock('@/lib/server/media', () => ({ isValidMediaRef: vi.fn(() => true) }));
vi.mock('@/lib/server/email', () => ({ looksLikeEmail: vi.fn(() => false), sendEmails: vi.fn() }));
vi.mock('@/lib/server/sms', () => ({ looksLikePhoneNumber: vi.fn(() => false), sendSmsMessages: vi.fn() }));
vi.mock('@/lib/server/geocode', () => ({ geocode: vi.fn() }));
vi.mock('@/lib/server/poll-notices', () => ({ notifyDateSettled: vi.fn(), openDecidingPlan: vi.fn() }));
vi.mock('@/lib/server/event-clone', () => ({ cloneEventForReuse: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({
  reportAndFail: vi.fn(),
  reportOperationalError: vi.fn(),
}));

import { runItBack, setInviteWindow, updateEventDetails } from './events';
import { reportAndFail } from '@/lib/server/observability';
import { cloneEventForReuse } from '@/lib/server/event-clone';
import { redirect } from 'next/navigation';

const EDIT = {
  title: 'Dinner',
  description: 'Dumplings.',
  locationName: 'Mei Wei',
  locationAddress: null,
  endsAt: null,
  timeZone: null,
  capacity: null,
  wishlistUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ ok: true, supabase: { rpc: mocks.rpc }, user: { id: 'user-1' } });
  mocks.checkEventManager.mockResolvedValue({ ok: true, isManager: true });
  mocks.createAdminClient.mockImplementation(() => {
    throw new Error('Admin client should not be reached');
  });
});

/**
 * D18: after creation a host can change the cover, theme, reminders and Open
 * Table, and add questions — never edit the ones already answered.
 */
describe('editing what a plan may change after creation', () => {
  function extrasAdmin(existingPositions: number[]) {
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from(table: string) {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { starts_at: null, location_name: 'Mei Wei', location_address: null, title: 'Dinner' },
                }),
              }),
            }),
            update: (row: Record<string, unknown>) => {
              updates.push(row);
              return { eq: async () => ({ error: null }) };
            },
          };
        }
        if (table === 'event_questions') {
          return {
            select: () => ({
              eq: async () => ({ data: existingPositions.map((position) => ({ position })), error: null }),
            }),
          };
        }
        throw new Error(`unexpected admin table ${table}`);
      },
    };
    return { admin, updates };
  }

  function sessionWithQuestions() {
    const inserted: unknown[] = [];
    const supabase = {
      rpc: mocks.rpc,
      from(table: string) {
        if (table !== 'event_questions') throw new Error(`unexpected session table ${table}`);
        return {
          insert: async (rows: unknown) => {
            inserted.push(rows);
            return { error: null };
          },
        };
      },
    };
    mocks.requireUser.mockResolvedValue({ ok: true, supabase, user: { id: 'user-1' } });
    return inserted;
  }

  const EXTRAS = {
    coverUrl: 'https://example.com/cover.jpg',
    theme: 'dusk' as const,
    remindersEnabled: false,
    openTable: true,
    newQuestions: [],
  };

  it('saves the cover, theme, reminders and Open Table with the details', async () => {
    const { admin, updates } = extrasAdmin([]);
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await updateEventDetails('event-1', { ...EDIT, startsAt: null, capacity: 8, extras: EXTRAS });

    expect(result.ok).toBe(true);
    expect(updates[0]).toMatchObject({
      cover_url: 'https://example.com/cover.jpg',
      theme: 'dusk',
      reminders_enabled: false,
      open_table: true,
    });
    // The founding rules are not the form's to send.
    expect(updates[0]).not.toHaveProperty('parental_approval');
    expect(updates[0]).not.toHaveProperty('recurrence');
  });

  it('refuses Open Table without a capacity, before writing anything', async () => {
    const { admin, updates } = extrasAdmin([]);
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await updateEventDetails('event-1', { ...EDIT, startsAt: null, capacity: null, extras: EXTRAS });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/capacity/);
    expect(updates).toEqual([]);
  });

  it('adds new questions after the ones already asked, through the host’s session', async () => {
    const inserted = sessionWithQuestions();
    const { admin } = extrasAdmin([0, 1]);
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await updateEventDetails('event-1', {
      ...EDIT,
      startsAt: null,
      capacity: 8,
      extras: {
        ...EXTRAS,
        newQuestions: [
          { prompt: ' Bringing anything? ', required: false, kind: 'text', options: [] },
          { prompt: '   ', required: true, kind: 'text', options: [] },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(inserted).toEqual([
      [{ prompt: 'Bringing anything?', required: false, kind: 'text', options: [], event_id: 'event-1', position: 2 }],
    ]);
  });

  it('keeps the wizard’s question limit', async () => {
    sessionWithQuestions();
    const { admin, updates } = extrasAdmin([0, 1, 2, 3, 4]);
    mocks.createAdminClient.mockReturnValue(admin);

    const result = await updateEventDetails('event-1', {
      ...EDIT,
      startsAt: null,
      capacity: 8,
      extras: { ...EXTRAS, newQuestions: [{ prompt: 'One more?', required: false, kind: 'text', options: [] }] },
    });

    expect(result).toMatchObject({ ok: false, error: 'A plan can ask up to 5 questions.' });
    expect(updates).toEqual([]);
  });
});

describe('giving a live invitation more time (D17)', () => {
  it('turns the database’s refusal into the sentence for it, with no code', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'a live invitation can only be given more time', hint: 'window_not_longer' },
    });

    const result = await setInviteWindow('event-1', 'invite-1', 30);

    expect(mocks.rpc).toHaveBeenCalledWith('set_invite_window', { p_invite: 'invite-1', p_minutes: 30 });
    expect(result).toEqual({
      ok: false,
      error: 'An invitation that’s already out can only be given more time.',
    });
    expect(vi.mocked(reportAndFail)).not.toHaveBeenCalled();
  });

  it('still reports anything else as a failure with its code', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset', hint: null } });

    await setInviteWindow('event-1', 'invite-1', 30);

    expect(vi.mocked(reportAndFail)).toHaveBeenCalledWith(
      'SB-INVITE-SEND',
      'invite.window',
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('Run it back (G27)', () => {
  it('hands a failed clone back with its code instead of redirecting in silence', async () => {
    vi.mocked(cloneEventForReuse).mockResolvedValue({
      ok: false,
      code: 'SB-PLAN-CLONE',
      error: 'Switchboard couldn’t set up the new plan.',
      fix: 'Nothing was sent. Try again in a moment.',
    });

    const result = await runItBack('event-1');

    expect(cloneEventForReuse).toHaveBeenCalledWith('user-1', 'event-1', null);
    expect(result).toMatchObject({ ok: false, code: 'SB-PLAN-CLONE' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('opens the new plan when the clone lands', async () => {
    vi.mocked(cloneEventForReuse).mockResolvedValue({ ok: true, eventId: 'clone-1' });

    await runItBack('event-1');

    expect(redirect).toHaveBeenCalledWith('/events/clone-1');
  });
});
