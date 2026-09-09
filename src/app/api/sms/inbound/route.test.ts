import { afterEach, describe, expect, test, vi } from 'vitest';
import { expectedTwilioSignature } from '@/lib/server/twilio-signature';

const suppression = vi.hoisted(() => ({
  rpc: vi.fn(),
  limit: vi.fn().mockResolvedValue(true),
  clear: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/lib/server/sms-opt-out', () => ({
  clearSmsOptOut: suppression.clear,
  recordSmsOptOut: suppression.record,
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: suppression.rpc }) }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: suppression.limit }));
vi.mock('@/lib/server/sms-policy', () => ({ smsBudgetAllows: suppression.limit }));
import { POST } from './route';

const WEBHOOK_URL = 'https://switchboardsocial.me/api/sms/inbound';

function signedRequest(
  fields: Record<string, string>,
  signatureOverride?: string,
): Request {
  const form = new URLSearchParams({
    AccountSid: 'ACtest',
    From: '+1 555 555 0100',
    To: '+1 555 555 0199',
    ...fields,
  });
  const signature = signatureOverride ?? expectedTwilioSignature(
    'test-auth-token',
    WEBHOOK_URL,
    form,
  );
  return new Request(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature,
    },
    body: form.toString(),
  });
}

afterEach(() => {
  suppression.rpc.mockReset();
  suppression.limit.mockResolvedValue(true);
  suppression.clear.mockReset();
  suppression.record.mockReset();
  vi.unstubAllEnvs();
});

describe('POST /api/sms/inbound', () => {
  function configure() {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboardsocial.me');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-auth-token');
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15555550199');
  }

  test('records a normalized STOP sender and returns no duplicate reply', async () => {
    configure();
    const response = await POST(signedRequest({ Body: ' stop ' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    await expect(response.text()).resolves.toContain('<Response></Response>');
    expect(suppression.record).toHaveBeenCalledWith('+15555550100');
    expect(suppression.clear).not.toHaveBeenCalled();
  });

  test('honors Twilio Advanced Opt-Out START and leaves HELP unchanged', async () => {
    configure();
    const start = await POST(signedRequest({ Body: 'anything', OptOutType: 'START' }));
    expect(start.status).toBe(200);
    expect(suppression.clear).toHaveBeenCalledWith('+15555550100');

    suppression.clear.mockReset();
    const help = await POST(signedRequest({ Body: 'HELP', OptOutType: 'HELP' }));
    expect(help.status).toBe(200);
    expect(suppression.clear).not.toHaveBeenCalled();
    expect(suppression.record).not.toHaveBeenCalled();
  });

  test('rejects an invalid signature before touching suppressions', async () => {
    configure();
    const response = await POST(signedRequest({ Body: 'STOP' }, 'not-a-signature'));

    expect(response.status).toBe(403);
    expect(suppression.record).not.toHaveBeenCalled();
    expect(suppression.clear).not.toHaveBeenCalled();
  });
  test('routes a signed coded RSVP and XML-escapes its reply', async () => {
    configure();
    suppression.rpc.mockResolvedValue({ data: 'You are in! <yes> & confirmed', error: null });
    const response = await POST(signedRequest({ Body: 'YES ABCDEF123456', MessageSid: 'SM11111111111111111111111111111111' }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('&lt;yes&gt; &amp; confirmed');
    expect(suppression.rpc).toHaveBeenCalledWith('handle_sms_command', { p_phone: '+15555550100', p_command: 'YES', p_code: 'ABCDEF123456', p_sid: 'SM11111111111111111111111111111111' });
    expect(suppression.clear).not.toHaveBeenCalled();
  });
  test('invalid signature and another destination cannot execute RSVP', async () => {
    configure();
    expect((await POST(signedRequest({ Body: 'YES ABCDEF123456' }, 'wrong'))).status).toBe(403);
    expect((await POST(signedRequest({ Body: 'YES ABCDEF123456', To: '+15555550198' }))).status).toBe(403);
    expect(suppression.rpc).not.toHaveBeenCalled();
  });
  test('duplicate receipt returns no second acknowledgment', async () => {
    configure();
    suppression.rpc.mockResolvedValue({ data: '', error: null });
    expect(await (await POST(signedRequest({ Body: 'YES ABCDEF123456', MessageSid: 'SM11111111111111111111111111111111' }))).text()).not.toContain('<Message>');
  });
  test('rate limit fails closed before executing a command', async () => {
    configure();
    suppression.limit.mockResolvedValue(false);
    await POST(signedRequest({ Body: 'YES ABCDEF123456', MessageSid: 'SM11111111111111111111111111111111' }));
    expect(suppression.rpc).not.toHaveBeenCalled();
  });
  test('unknown messages get usage instructions without guessing a plan', async () => {
    configure();
    suppression.rpc.mockResolvedValue({ data: 'Use YES plus your code.', error: null });
    const response = await POST(signedRequest({ Body: 'yes 123', MessageSid: 'SM11111111111111111111111111111111' }));
    expect(await response.text()).toContain('Use YES plus your code.');
    expect(suppression.rpc).toHaveBeenCalledWith('handle_sms_command', expect.objectContaining({ p_command: 'UNKNOWN' }));
  });

});
