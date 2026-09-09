import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { expectedTwilioSignature } from '@/lib/server/twilio-signature';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
import { POST } from './route';
const id = '20000000-0000-0000-0000-000000000001';
const url = `https://switchboardsocial.me/api/sms/status?id=${id}`;
function request(status = 'delivered', signature = true, account = 'ACtest') {
  const form = new URLSearchParams({ AccountSid: account, MessageSid: `SM${'1'.repeat(32)}`, MessageStatus: status, To: '+15555550999' });
  return new Request(url, { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature ? expectedTwilioSignature('token', url, form) : 'invalid' } });
}
beforeEach(() => { vi.stubEnv('TWILIO_AUTH_TOKEN', 'token'); vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboardsocial.me'); rpc.mockReset().mockResolvedValue({ error: null, data: true }); });
afterEach(() => vi.unstubAllEnvs());
test('rejects forged callbacks before database access', async () => { expect((await POST(request('delivered', false))).status).toBe(403); expect(rpc).not.toHaveBeenCalled(); });
test('rejects another account even with a valid signature', async () => { expect((await POST(request('delivered', true, 'ACother'))).status).toBe(403); expect(rpc).not.toHaveBeenCalled(); });
test('passes signed receipt to atomic monotonic writer', async () => { expect((await POST(request())).status).toBe(204); expect(rpc).toHaveBeenCalledWith('record_sms_status', expect.objectContaining({ p_id: id, p_status: 'delivered' })); });
test('accepts duplicate receipts without asking Twilio to retry', async () => { rpc.mockResolvedValue({ error: null, data: false }); expect((await POST(request())).status).toBe(204); });
test('asks Twilio to retry a database failure', async () => { rpc.mockResolvedValue({ error: { message: 'unavailable' } }); expect((await POST(request())).status).toBe(503); });
test('rejects internal queue states from callbacks', async () => { expect((await POST(request('unknown'))).status).toBe(400); expect(rpc).not.toHaveBeenCalled(); });
