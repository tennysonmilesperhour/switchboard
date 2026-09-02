import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  sendSmsWithResult,
  guestInviteSmsText,
  PROVIDER_TIMEOUT_MS,
} from './sms';

// These asserted against Plivo until #94 moved delivery back to Twilio, so the
// suite has been red ever since — which is its own problem: a permanently
// failing test is a test nobody reads, on the exact path that kept shipping
// broken invite links.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

describe('sendSmsWithResult', () => {
  test('reports invalid recipients and missing configuration', async () => {
    await expect(sendSmsWithResult({ to: 'not a phone', body: 'Hello' })).resolves.toEqual({
      status: 'invalid_recipient',
      provider: 'twilio',
    });
    await expect(sendSmsWithResult({ to: '+1 555 555 0100', body: 'Hello' })).resolves.toEqual({
      status: 'not_configured',
      provider: 'twilio',
    });
  });

  test('sends through Twilio and preserves the message id on success', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.TWILIO_FROM_NUMBER = '+15555550199';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM123' }), { status: 201 }),
    ));

    await expect(sendSmsWithResult({ to: '+1 555 555 0100', body: 'Hello' })).resolves.toEqual({
      status: 'sent',
      provider: 'twilio',
      providerMessageId: 'SM123',
    });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    expect(init).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('ACtest:test-auth-token').toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    );
    const form = new URLSearchParams(init.body as string);
    expect(form.get('From')).toBe('+15555550199');
    expect(form.get('To')).toBe('+15555550100');
    expect(form.get('Body')).toBe('Hello');
  });

  test('surfaces a provider error body as a failure', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.TWILIO_FROM_NUMBER = '+15555550199';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error_code: 30007 }), { status: 201 }),
    ));

    await expect(sendSmsWithResult({ to: '+1 555 555 0100', body: 'Hello' })).resolves.toEqual({
      status: 'failed',
      provider: 'twilio',
      errorCode: 'provider_error',
    });
  });

  test('aborts a stalled provider at the configured timeout', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.TWILIO_FROM_NUMBER = '+15555550199';
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init?.signal?.reason),
            { once: true },
          );
        }),
      ),
    );

    const delivery = sendSmsWithResult({
      to: '+1 555 555 0100',
      body: 'Hello',
    });
    controller.abort(new DOMException('timed out', 'TimeoutError'));

    await expect(delivery).resolves.toEqual({
      status: 'failed',
      provider: 'twilio',
      errorCode: 'timeout',
    });
    expect(timeout).toHaveBeenCalledWith(PROVIDER_TIMEOUT_MS);
  });
});

describe('guestInviteSmsText', () => {
  test('ends with an absolute https link so it linkifies in a messages app', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboardsocial.me');
    const body = guestInviteSmsText('Taco night', 'tok-123');

    expect(body).toContain('Taco night');
    expect(body).toMatch(/https:\/\/switchboardsocial\.me\/rsvp\/tok-123$/);
    // A trailing character after the URL is the classic way a texted link
    // arrives broken — some clients swallow it into the href, others stop the
    // link short. The URL must be the last thing in the message.
    expect(body.trimEnd()).toBe(body);
  });
});
