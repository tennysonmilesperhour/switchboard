import { afterEach, describe, expect, test, vi } from 'vitest';
import { sendSmsWithResult } from './sms';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PLIVO_AUTH_ID;
  delete process.env.PLIVO_AUTH_TOKEN;
  delete process.env.PLIVO_FROM_NUMBER;
});

describe('sendSmsWithResult', () => {
  test('reports invalid recipients and missing configuration', async () => {
    await expect(sendSmsWithResult({ to: 'not a phone', body: 'Hello' })).resolves.toEqual({
      status: 'invalid_recipient',
      provider: 'plivo',
    });
    await expect(sendSmsWithResult({ to: '+1 555 555 0100', body: 'Hello' })).resolves.toEqual({
      status: 'not_configured',
      provider: 'plivo',
    });
  });

  test('sends through Plivo and preserves the message id on success', async () => {
    process.env.PLIVO_AUTH_ID = 'test-auth-id';
    process.env.PLIVO_AUTH_TOKEN = 'test-auth-token';
    process.env.PLIVO_FROM_NUMBER = '+15555550199';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message_uuid: ['sms_123'] }), { status: 202 }),
    ));
    await expect(sendSmsWithResult({ to: '+1 555 555 0100', body: 'Hello' })).resolves.toEqual({
      status: 'sent',
      provider: 'plivo',
      providerMessageId: 'sms_123',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.plivo.com/v1/Account/test-auth-id/Message/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('test-auth-id:test-auth-token').toString('base64')}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          src: '+15555550199',
          dst: '+15555550100',
          text: 'Hello',
        }),
      }),
    );
  });
});
