import { createHmac } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), rate: vi.fn(), sms: vi.fn(), enabled: vi.fn(), revalidate: vi.fn(),
  // Next's redirect() never returns; throwing the destination lets a test read it.
  redirect: vi.fn((url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }); }),
}));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/server/sms', () => ({ sendSmsWithResult: mocks.sms, smsEnabled: mocks.enabled }));
vi.mock('@/lib/server/email', () => ({ appUrl: (p: string) => p, sendEmailWithResult: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
import { requestContactVerification, confirmPhoneContact, confirmEmailContact } from './contact-verification';

let contact: { data: unknown; error: unknown };
let request: { data: unknown; error: unknown };
let write: { data: unknown; error: unknown };
let inserted: Record<string, unknown>;
/** Every query the admin client built, as [table, method, ...args] steps. */
let queries: { table: string; steps: unknown[][] }[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CONTACT_VERIFICATION_SECRET', 'test-secret');
  mocks.requireUser.mockResolvedValue({ ok: true, user: { id: 'user-1' } });
  mocks.rate.mockResolvedValue(true); mocks.enabled.mockReturnValue(true);
  mocks.sms.mockResolvedValue({ status: 'sent', provider: 'twilio', providerMessageId: 'SM123' });
  contact = { data: { normalized_value: '+15555550100', verified_at: null }, error: null };
  request = { data: null, error: null };
  write = { data: { user_id: 'user-1' }, error: null };
  inserted = {};
  queries = [];
  mocks.from.mockImplementation((table: string) => {
    let writing = false;
    const steps: unknown[][] = [];
    queries.push({ table, steps });
    const q = {
      select: vi.fn((...a: unknown[]) => { steps.push(['select', ...a]); return q; }),
      eq: vi.fn((...a: unknown[]) => { steps.push(['eq', ...a]); return q; }),
      delete: vi.fn(() => { steps.push(['delete']); writing = true; return q; }),
      update: vi.fn((...a: unknown[]) => { steps.push(['update', ...a]); writing = true; return q; }),
      insert: vi.fn((row: Record<string, unknown>) => { inserted = row; writing = true; return q; }),
      maybeSingle: vi.fn(async () => writing ? write : table === 'profile_contacts' ? contact : request),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(writing ? write : contact).then(resolve),
    }; return q;
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test('missing configuration produces an operator error before deleting a code', async () => {
  vi.stubEnv('CONTACT_VERIFICATION_SECRET', '');
  expect(await requestContactVerification('phone')).toMatchObject({ ok: false, code: 'SB-VERIFY-CONFIG', fix: null });
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
});
test('a database read failure is not mistaken for a missing phone', async () => {
  contact = { data: null, error: { code: '42P01', message: 'relation missing' } };
  expect(await requestContactVerification('phone')).toMatchObject({ code: 'SB-VERIFY-START' });
  expect(mocks.sms).not.toHaveBeenCalled();
});
test('hashes the code and scopes the number budget across accounts', async () => {
  expect(await requestContactVerification('phone')).toMatchObject({ ok: true });
  const body = mocks.sms.mock.calls[0][0].body;
  const code = body.match(/code is (\d{6})/)[1];
  expect(inserted.code_hash).toBe(createHmac('sha256', 'test-secret').update(`user-1:+15555550100:${code}`).digest('hex'));
  expect(JSON.stringify(inserted)).not.toContain(`"${code}"`);
  expect(mocks.rate.mock.calls[1][0]).toMatch(/^contact-verify-number:[a-f0-9]{64}$/);
});
test('a provider rejection remains a failure with an operator diagnostic', async () => {
  mocks.sms.mockResolvedValue({ status: 'failed', errorCode: 'twilio_30034' });
  expect(await requestContactVerification('phone')).toMatchObject({ ok: false, code: 'SB-VERIFY-DELIVERY', fix: null });
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('twilio_30034'));
});
test('STOP has a reachable re-opt-in instruction', async () => {
  mocks.sms.mockResolvedValue({ status: 'opted_out' });
  expect(await requestContactVerification('phone')).toMatchObject({ code: 'SB-VERIFY-STOPPED', fix: expect.stringContaining('START') });
});
test('does not report verified if the phone changed during verification', async () => {
  request = { data: { normalized_value: '+15555550100', code_hash: createHmac('sha256', 'test-secret').update('user-1:+15555550100:123456').digest('hex'), attempts: 0, expires_at: new Date(Date.now()+600000).toISOString() }, error: null };
  write = { data: null, error: null };
  expect(await confirmPhoneContact('123456')).toMatchObject({ ok: false, error: expect.stringContaining('changed') });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
test('a code stops working after repeated misses, even the right one', async () => {
  // The attempts column was written on every miss and never read.
  request = { data: { normalized_value: '+15555550100', code_hash: createHmac('sha256', 'test-secret').update('user-1:+15555550100:123456').digest('hex'), attempts: 5, expires_at: new Date(Date.now()+600000).toISOString() }, error: null };
  expect(await confirmPhoneContact('123456')).toMatchObject({ ok: false, error: expect.stringContaining('Request a new code') });
  expect(queries.some((q) => q.table === 'profile_contacts')).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
test('code lookup errors are not reported as expired codes', async () => {
  request = { data: null, error: { message: 'database unavailable' } };
  expect(await confirmPhoneContact('123456')).toMatchObject({ code: 'SB-VERIFY-CHECK' });
});
test('blocks unauthenticated sends', async () => {
  mocks.requireUser.mockResolvedValue({ ok: false, code: 'SB-AUTH-REQUIRED' });
  expect(await requestContactVerification('phone')).toMatchObject({ ok: false });
  expect(mocks.sms).not.toHaveBeenCalled();
});

describe('opening an email verification link', () => {
  const token = 'a'.repeat(43);
  const form = (value = token) => { const f = new FormData(); f.set('token', value); return f; };
  const landing = async (value = token) => {
    try { await confirmEmailContact(form(value)); } catch (error) { return (error as { url?: string }).url; }
    throw new Error('confirmEmailContact returned without redirecting');
  };
  const future = () => new Date(Date.now() + 600000).toISOString();
  const wrote = (table: string) => queries.some((q) => q.table === table && q.steps.some(([m]) => m === 'update'));

  test('a session that ended while the page was open signs in and comes straight back', async () => {
    mocks.requireUser.mockResolvedValue({ ok: false, code: 'SB-AUTH-REQUIRED' });
    const to = await landing();
    expect(to).toBe(`/login?next=${encodeURIComponent(`/verify-contact?token=${token}`)}`);
    expect(to).not.toContain('error=');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  test('a truncated link goes back to the page that explains it, without a lookup', async () => {
    expect(await landing('abc')).toBe('/verify-contact?token=abc');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  test('a link opened in a different account says so instead of calling it expired', async () => {
    request = { data: { user_id: 'user-2', normalized_value: 'a@example.com', expires_at: future() }, error: null };
    expect(await landing()).toBe(`/verify-contact?token=${token}&reason=other-account`);
    expect(queries[0].steps).not.toContainEqual(['eq', 'user_id', 'user-1']);
    expect(wrote('profile_contacts')).toBe(false);
  });
  test('an expired link of your own is still reported as expired', async () => {
    request = { data: { user_id: 'user-1', normalized_value: 'a@example.com', expires_at: new Date(Date.now() - 1000).toISOString() }, error: null };
    expect(await landing()).toBe('/settings?contact=expired');
    expect(wrote('profile_contacts')).toBe(false);
  });
  test('a lookup failure is logged with its code, not reported as an expired link', async () => {
    request = { data: null, error: { message: 'database unavailable' } };
    expect(await landing()).toBe('/settings?contact=error');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SB-VERIFY-CHECK'));
  });
  test('verifies only the signed-in account\'s own contact', async () => {
    request = { data: { user_id: 'user-1', normalized_value: 'a@example.com', expires_at: future() }, error: null };
    write = { data: null, error: null };
    expect(await landing()).toBe('/settings?contact=verified');
    const update = queries.find((q) => q.table === 'profile_contacts');
    expect(update?.steps).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(update?.steps).toContainEqual(['eq', 'normalized_value', 'a@example.com']);
  });
});
