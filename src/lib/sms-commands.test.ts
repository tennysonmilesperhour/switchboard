import { expect, test } from 'vitest';
import { parseSmsCommand, smsReplyHint, imminentChange, canSubscribeGuestSms } from './sms-commands';
import { ANSWERABLE_EVENT_STATUSES } from './share-link';

test.each(['YES','NO','STOP','START','HELP','YES ABC','YES ABCDEF123456 extra','CONFIRM'])('does not guess a plan or intercept opt-out: %s', body => {
  expect(parseSmsCommand(body)).toBeNull();
});
test('accepts an explicit code and guest JOIN token', () => {
  expect(parseSmsCommand(' yes abcdef123456 ')).toEqual({ command: 'YES', code: 'ABCDEF123456' });
  expect(parseSmsCommand('JOIN 21000000-0000-0000-0000-000000000030')?.command).toBe('JOIN');
  expect(smsReplyHint('ABCDEF123456', 'plans')).toContain('YES ABCDEF123456 or NO ABCDEF123456');
});
test('urgent logistics changes use the old or new imminent start, never a past start', () => {
  const now = Date.parse('2026-09-10T12:00:00Z');
  expect(imminentChange('2026-09-10T12:15:00Z', '2026-09-11T12:00:00Z', now)).toBe(true);
  expect(imminentChange(null, '2026-09-10T14:00:00Z', now)).toBe(true);
  expect(imminentChange(null, '2026-09-10T14:01:00Z', now)).toBe(false);
  expect(imminentChange('2026-09-10T11:00:00Z', null, now)).toBe(false);
});

test('urgent exception ends at the earlier relevant start', async () => {
 const { urgentChangeDeadline } = await import('./sms-commands');
 expect(urgentChangeDeadline('2026-09-10T12:15:00Z', '2026-09-11T12:00:00Z', Date.parse('2026-09-10T12:00:00Z'))).toBe('2026-09-10T12:15:00.000Z');
});

test('text subscriptions open for exactly the statuses a share link can answer', () => {
  const statuses = ['draft', 'deciding', 'inviting', 'confirmed', 'cancelled', 'past'];
  expect(statuses.filter((status) => canSubscribeGuestSms(status, null))).toEqual([
    ...ANSWERABLE_EVENT_STATUSES,
  ]);
  const now = Date.parse('2026-09-10T12:00:00Z');
  expect(canSubscribeGuestSms('inviting', '2026-09-10T11:00:00Z', now)).toBe(false);
});
