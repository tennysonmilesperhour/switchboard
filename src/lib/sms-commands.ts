/** Bare YES is reserved for Twilio opt-in. RSVP always names its invitation. */
export function parseSmsCommand(body: string): { command: 'YES' | 'NO' | 'CONFIRM' | 'JOIN'; code: string } | null {
  const match = body.trim().match(/^(YES|NO|CONFIRM)\s+([0-9a-f]{12})$/i);
  if (match) return { command: match[1].toUpperCase() as 'YES' | 'NO' | 'CONFIRM', code: match[2].toUpperCase() };
  const join = body.trim().match(/^JOIN\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return join ? { command: 'JOIN', code: join[1] } : null;
}

export function smsReplyHint(code: string, category: string): string {
  if (!/^[0-9a-f]{12}$/i.test(code)) return '';
  return category === 'reminders' ? `Reply CONFIRM ${code} to confirm attendance.` : `Reply YES ${code} or NO ${code}.`;
}

export function imminentChange(previous: string | null, next: string | null, now = Date.now()): boolean {
  return [previous, next].some(value => value !== null && Date.parse(value) > now && Date.parse(value) <= now + 2 * 60 * 60 * 1000);
}

export function urgentChangeDeadline(previous: string | null, next: string | null, now = Date.now()): string | undefined {
  const starts = [previous, next].filter((value): value is string => Boolean(value)).map(Date.parse).filter(value => value > now && value <= now + 7_200_000);
  return starts.length ? new Date(Math.min(...starts)).toISOString() : undefined;
}

export function canSubscribeGuestSms(status: string, startsAt: string | null, now = Date.now()): boolean {
  return ['inviting', 'confirmed', 'deciding'].includes(status) && (!startsAt || Date.parse(startsAt) > now);
}
