import { createHmac } from 'node:crypto';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), rate: vi.fn(), sms: vi.fn(), enabled: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/server/sms', () => ({ sendSmsWithResult: mocks.sms, smsEnabled: mocks.enabled }));
vi.mock('@/lib/server/email', () => ({ appUrl: (p: string) => p, sendEmailWithResult: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { requestContactVerification, confirmPhoneContact } from './contact-verification';

let contact: { data: unknown; error: unknown };
let request: { data: unknown; error: unknown };
let write: { data: unknown; error: unknown };
let inserted: Record<string, unknown>;
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
  mocks.from.mockImplementation((table: string) => {
    let writing = false;
    const q = {
      select: vi.fn(() => q), eq: vi.fn(() => q),
      delete: vi.fn(() => { writing = true; return q; }),
      update: vi.fn(() => { writing = true; return q; }),
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
test('code lookup errors are not reported as expired codes', async () => {
  request = { data: null, error: { message: 'database unavailable' } };
  expect(await confirmPhoneContact('123456')).toMatchObject({ code: 'SB-VERIFY-CHECK' });
});
test('blocks unauthenticated sends', async () => {
  mocks.requireUser.mockResolvedValue({ ok: false, code: 'SB-AUTH-REQUIRED' });
  expect(await requestContactVerification('phone')).toMatchObject({ ok: false });
  expect(mocks.sms).not.toHaveBeenCalled();
});
