import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Telling the owner the client did something.
 *
 * The behaviour worth pinning down is the asymmetry: a note goes out at once
 * and in full, while a burst of ticks collapses into one hourly summary. Get
 * the second one wrong and someone walking a thirty-five item list sends
 * thirty-five emails, which is how an address stops being read — and then the
 * notes are lost too.
 */

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => true),
  emailEnabled: vi.fn(() => true),
  appUrl: vi.fn((path: string) => `https://switchboardsocial.me${path}`),
  checkRateLimit: vi.fn(async () => true),
  reportOperationalError: vi.fn(),
}));

vi.mock('@/lib/server/email', () => ({
  sendEmail: mocks.sendEmail,
  emailEnabled: mocks.emailEnabled,
  appUrl: mocks.appUrl,
}));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/server/observability', () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { notifyNewFeedback, notifyProgress } from './scope-watch';

interface SentMail {
  to: string;
  subject: string;
  text: string;
}

/** The first message handed to the provider. Fails loudly if none was. */
function sent(): SentMail {
  const calls = mocks.sendEmail.mock.calls as unknown as SentMail[][];
  expect(calls.length, 'no email was sent').toBeGreaterThan(0);
  return calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SCOPE_WATCH_EMAIL = 'owner@example.com';
  mocks.emailEnabled.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.sendEmail.mockResolvedValue(true);
});

afterEach(() => {
  delete process.env.SCOPE_WATCH_EMAIL;
});

describe('a new note', () => {
  it('goes out immediately, with the words in it', async () => {
    await notifyNewFeedback({
      body: 'The Share button does nothing on my phone.',
      reporter: 'Gina',
      itemId: 'J4',
      itemLabel: 'Signals reach a group',
      screenshots: 2,
    });

    const mail = sent();
    expect(mail.to).toBe('owner@example.com');
    expect(mail.subject).toContain('Gina left a note');
    // The point is not having to go and look, so the note travels in the email.
    expect(mail.text).toContain('The Share button does nothing on my phone.');
    expect(mail.text).toContain('J4');
    expect(mail.text).toContain('2 screenshots');
    expect(mail.text).toContain('https://switchboardsocial.me/scope-verification');
  });

  it('is not debounced — a note must never be swallowed', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    await notifyNewFeedback({
      body: 'Second thing I found',
      reporter: null,
      itemId: null,
      itemLabel: null,
      screenshots: 0,
    });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('copes with no name and no item', async () => {
    await notifyNewFeedback({
      body: 'Something is off',
      reporter: null,
      itemId: null,
      itemLabel: null,
      screenshots: 0,
    });

    const mail = sent();
    expect(mail.subject).toContain('Someone left a note');
    expect(mail.text).toContain('the checklist in general');
    expect(mail.text).toContain('No screenshots.');
  });

  it('says one screenshot, not 1 screenshots', async () => {
    await notifyNewFeedback({
      body: 'x',
      reporter: null,
      itemId: null,
      itemLabel: null,
      screenshots: 1,
    });
    expect(sent().text).toContain('1 screenshot attached');
  });
});

describe('progress', () => {
  it('reports where the list stands, not which box moved', async () => {
    const result = await notifyProgress({ checked: 18, total: 35, lastBy: 'Gina' });

    expect(result).toBe('sent');
    const mail = sent();
    expect(mail.subject).toContain('18/35');
    expect(mail.text).toContain('18 of 35');
    expect(mail.text).toContain('17 items still unchecked');
    expect(mail.text).toContain('Last change by Gina.');
  });

  it('sends at most one an hour, so a walk through the list is one email', async () => {
    // The limiter is the debounce: false means "already told them this hour".
    mocks.checkRateLimit.mockResolvedValue(false);
    const result = await notifyProgress({ checked: 19, total: 35, lastBy: 'Gina' });

    expect(result).toBe('debounced');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('asks for one token per hour', async () => {
    await notifyProgress({ checked: 1, total: 35, lastBy: null });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('scope-watch:progress', 1, 3600);
  });

  it('says so plainly when the list is finished', async () => {
    await notifyProgress({ checked: 35, total: 35, lastBy: null });
    expect(sent().text).toContain('That is the whole list.');
  });

  it('gets the singular right at one left', async () => {
    await notifyProgress({ checked: 34, total: 35, lastBy: null });
    expect(sent().text).toContain('1 item still unchecked');
  });

  it('leaves out the attribution line when nobody gave a name', async () => {
    await notifyProgress({ checked: 3, total: 35, lastBy: null });
    expect(sent().text).not.toContain('Last change by');
  });
});

describe('when it is switched off', () => {
  it('does nothing without a recipient, and does not spend the debounce', async () => {
    delete process.env.SCOPE_WATCH_EMAIL;
    const result = await notifyProgress({ checked: 1, total: 35, lastBy: null });

    expect(result).toBe('off');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    // Checking the limiter here would burn the hour's token for nothing.
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it('does nothing when the email provider is not configured', async () => {
    mocks.emailEnabled.mockReturnValue(false);
    expect(await notifyProgress({ checked: 1, total: 35, lastBy: null })).toBe('off');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('ignores a recipient that is not an address', async () => {
    process.env.SCOPE_WATCH_EMAIL = 'not-an-address';
    expect(await notifyProgress({ checked: 1, total: 35, lastBy: null })).toBe('off');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('reports a provider failure rather than throwing at the caller', async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error('resend is down'));

    await expect(
      notifyNewFeedback({
        body: 'x',
        reporter: null,
        itemId: null,
        itemLabel: null,
        screenshots: 0,
      }),
    ).resolves.toBeUndefined();
    expect(mocks.reportOperationalError).toHaveBeenCalled();
  });
});
