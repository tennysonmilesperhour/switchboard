import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings renders nothing it could not read (completion plan G4). A profile
 * read that failed used to render every control at its default, and the next
 * Save wrote those defaults over what the person had chosen — and the failure
 * was logged as an appearance problem.
 */

const mocks = vi.hoisted(() => {
  type Result = { data: unknown; error: { message: string } | null };
  const results: Record<string, Result> = {};
  const reset = () => {
    results.profiles = { data: { display_name: 'Alex', handle: 'alex' }, error: null };
    results.my_private_profile = { data: { contact_phone: '+15555550100' }, error: null };
    results.profile_contacts = {
      data: [{ kind: 'phone', verified_at: '2026-09-01', normalized_value: '+15555550100' }],
      error: null,
    };
    results.is_current_user_platform_moderator = { data: false, error: null };
    results.sms_preferences = { data: null, error: null };
    results.notification_routes = { data: null, error: null };
    results.profile_blocks = { data: [], error: null };
    results.sms_opt_outs = { data: null, error: null };
  };
  reset();

  function builder(name: string) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const method of ['select', 'eq', 'order']) b[method] = chain;
    b.maybeSingle = async () => results[name];
    b.then = (resolve: (value: unknown) => void) => resolve(results[name]);
    return b;
  }
  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string) => builder(name),
  };
  return { results, reset, client, reportOperationalError: vi.fn(async () => undefined) };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mocks.client,
  hasAdminCredentials: () => true,
}));
vi.mock('@/lib/actions/calendar-sync', () => ({ getCalendarStatus: async () => null }));
vi.mock('@/lib/server/passport', () => ({ loadPassport: async () => ({}) }));
vi.mock('@/lib/passport', () => ({ passportProgress: () => ({ done: false }) }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import type { User } from '@supabase/supabase-js';
import { anySettingsReadFailed, loadSettingsPage, needsRecoveryEmail } from './settings-page';

const user = { id: 'user-1', email: 'alex@users.switchboard.local' } as User;

afterEach(() => {
  mocks.reset();
  mocks.reportOperationalError.mockClear();
});

describe('loadSettingsPage', () => {
  it('reports every read as known when they all succeed', async () => {
    const page = await loadSettingsPage(user);
    expect(anySettingsReadFailed(page.failed)).toBe(false);
    expect(page.phoneVerified).toBe(true);
    expect(page.verifiedPhone).toBe('+15555550100');
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });

  it('marks a failed profile read as unknown and logs it as a Settings load', async () => {
    mocks.results.profiles = { data: null, error: { message: 'permission denied' } };
    const page = await loadSettingsPage(user);
    expect(page.failed.profile).toBe(true);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      'settings.load',
      { message: 'permission denied' },
      { userId: 'user-1', part: 'profile' },
    );
  });

  it('treats a missing profile row as unknown too, never as defaults', async () => {
    mocks.results.profiles = { data: null, error: null };
    const page = await loadSettingsPage(user);
    expect(page.failed.profile).toBe(true);
  });

  it('marks each notification read that failed', async () => {
    mocks.results.sms_preferences = { data: null, error: { message: 'x' } };
    mocks.results.notification_routes = { data: null, error: { message: 'y' } };
    const page = await loadSettingsPage(user);
    expect(page.failed.sms).toBe(true);
    expect(page.failed.routes).toBe(true);
    expect(page.failed.profile).toBe(false);
  });

  it('knows when the verified phone has texted STOP', async () => {
    mocks.results.sms_opt_outs = { data: { normalized_number: '+15555550100' }, error: null };
    const page = await loadSettingsPage(user);
    expect(page.phoneOptedOut).toBe(true);
  });

  it('asks a username-only account for a recovery email, and nobody else', async () => {
    expect((await loadSettingsPage(user)).recoveryEmailMissing).toBe(true);
    expect(
      (await loadSettingsPage({ ...user, email: 'alex@example.com' } as User))
        .recoveryEmailMissing,
    ).toBe(false);
  });
});

describe('needsRecoveryEmail', () => {
  it('is only for a synthetic login address with no verified email', () => {
    expect(needsRecoveryEmail('a@users.switchboard.local', false)).toBe(true);
    expect(needsRecoveryEmail('a@users.switchboard.local', true)).toBe(false);
    expect(needsRecoveryEmail('a@example.com', false)).toBe(false);
  });
});
