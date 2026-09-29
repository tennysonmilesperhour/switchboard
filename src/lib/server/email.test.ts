import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  guestEmailHeaders,
  looksLikeEmail,
  PROVIDER_TIMEOUT_MS,
  sendEmailWithResult,
} from './email';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
});

describe('looksLikeEmail', () => {
  test('accepts ordinary addresses', () => {
    expect(looksLikeEmail('sam@example.com')).toBe(true);
    expect(looksLikeEmail('a.b+tag@sub.domain.org')).toBe(true);
    expect(looksLikeEmail('  spaced@example.com  ')).toBe(true);
  });

  test('rejects phone numbers and junk', () => {
    expect(looksLikeEmail('+1 555 123 4567')).toBe(false);
    expect(looksLikeEmail('not-an-email')).toBe(false);
    expect(looksLikeEmail('missing@domain')).toBe(false);
    expect(looksLikeEmail('@nolocal.com')).toBe(false);
  });

  test('rejects empty / null', () => {
    expect(looksLikeEmail(null)).toBe(false);
    expect(looksLikeEmail(undefined)).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });

  test('reports missing provider configuration explicitly', async () => {
    await expect(sendEmailWithResult({
      to: 'sam@example.com',
      subject: 'Hello',
      text: 'Hi',
    })).resolves.toEqual({ status: 'not_configured', provider: 'resend' });
  });

  test('preserves a provider message id on success', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Switchboard <test@example.com>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
    ));
    await expect(sendEmailWithResult({
      to: 'sam@example.com',
      subject: 'Hello',
      text: 'Hi',
    })).resolves.toEqual({
      status: 'sent',
      provider: 'resend',
      providerMessageId: 'email_123',
    });
  });

  test('aborts a stalled provider at the configured timeout', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Switchboard <test@example.com>';
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

    const delivery = sendEmailWithResult({
      to: 'sam@example.com',
      subject: 'Hello',
      text: 'Hi',
    });
    controller.abort(new DOMException('timed out', 'TimeoutError'));

    await expect(delivery).resolves.toEqual({
      status: 'failed',
      provider: 'resend',
      errorCode: 'timeout',
    });
    expect(timeout).toHaveBeenCalledWith(PROVIDER_TIMEOUT_MS);
  });

  test('passes an unsubscribe header for guest mail', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Switchboard <test@example.com>';
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'support@example.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
    ));

    await sendEmailWithResult({
      to: 'guest@example.com',
      subject: 'An invitation',
      text: 'Hello',
      headers: guestEmailHeaders(),
    });

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual(expect.objectContaining({
      headers: {
        'List-Unsubscribe': '<mailto:support@example.com?subject=unsubscribe>',
      },
    }));
  });

  test('sends a reply-to address through the provider field', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Switchboard <test@example.com>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_456' }), { status: 200 }),
    ));

    await sendEmailWithResult({
      to: 'owner@example.com',
      subject: 'Your claim',
      text: 'Hello',
      replyTo: 'support@example.com',
    });

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.reply_to).toBe('support@example.com');
    expect(body.headers).toBeUndefined();
  });
});
