import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  route: 'email', address: 'person@example.com', expires: '', send: vi.fn(), update: vi.fn(), queryError: false,
}));
vi.mock('@/lib/server/email', () => ({ sendEmailWithResult: mocks.send }));
vi.mock('@/lib/links', () => ({ absoluteUrl: (path: string) => `https://switchboardsocial.me${path}` }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: async () => ({ data: [{ id: 'job', user_id: 'user', notification_id: 'notice', email: 'person@example.com', category: 'plans', expires_at: mocks.expires }], error: null }),
  from: (table: string) => {
    const chain = {
      select: () => chain, eq: () => chain, not: () => chain,
      maybeSingle: async () => ({ data: table === 'notification_routes' ? { plans: mocks.route } : table === 'profile_contacts' ? { normalized_value: mocks.address } : { title: 'Plan', body: 'Changed', url: '//untrusted.test' }, error: mocks.queryError ? new Error('unavailable') : null }),
      update: (data: unknown) => { mocks.update(data); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
    };
    return chain;
  },
}) }));
import { sweepNotificationEmails } from './notification-emails';
beforeEach(() => { vi.clearAllMocks(); mocks.route = 'email'; mocks.address = 'person@example.com'; mocks.expires = new Date(Date.now() + 60_000).toISOString(); mocks.queryError = false; mocks.send.mockResolvedValue({ status: 'sent' }); });
test('sends only the selected channel to the current verified email', async () => {
  expect(await sweepNotificationEmails()).toBe(1);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'person@example.com', text: expect.stringContaining('https://switchboardsocial.me/notifications') }));
});
test.each(['sms', 'push', 'in_app', 'existing'])('a changed %s route suppresses queued email', async route => {
  mocks.route = route;
  expect(await sweepNotificationEmails()).toBe(0);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'suppressed' }));
});
test('recycled email and unavailable verification cannot receive queued content', async () => {
  mocks.address = 'new@example.com'; await sweepNotificationEmails();
  mocks.address = 'person@example.com'; mocks.queryError = true; await sweepNotificationEmails();
  expect(mocks.send).not.toHaveBeenCalled();
});
test('expired notices never send', async () => {
  mocks.expires = new Date(0).toISOString(); await sweepNotificationEmails(); expect(mocks.send).not.toHaveBeenCalled();
});
test('provider failures do not return a job to the pending queue', async () => {
  mocks.send.mockResolvedValue({ status: 'failed' });
  await sweepNotificationEmails();
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
});
