import { afterEach, describe, expect, test, vi } from 'vitest';
import { expectedTwilioSignature } from '@/lib/server/twilio-signature';

const suppression = vi.hoisted(() => ({
  clear: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/lib/server/sms-opt-out', () => ({
  clearSmsOptOut: suppression.clear,
  recordSmsOptOut: suppression.record,
}));

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
});
