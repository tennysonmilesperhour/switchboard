import { parseSmsCommand } from '@/lib/sms-commands';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { smsBudgetAllows, smsDestinationAllowed } from '@/lib/server/sms-policy';
import { absoluteUrl } from '@/lib/links';
import { normalizePhoneNumber } from '@/lib/phone';
import { clearSmsOptOut, recordSmsOptOut } from '@/lib/server/sms-opt-out';
import { isValidTwilioSignature } from '@/lib/server/twilio-signature';
import { reportOperationalError } from '@/lib/server/observability';

export const runtime = 'nodejs';

const STOP_WORDS = new Set([
  'CANCEL',
  'END',
  'OPTOUT',
  'QUIT',
  'REVOKE',
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
]);
const START_WORDS = new Set(['START', 'UNSTOP', 'YES']);
const HELP_WORDS = new Set(['HELP', 'INFO']);

type OptOutType = 'STOP' | 'START' | 'HELP';

function optOutType(form: URLSearchParams): OptOutType | null {
  const advanced = form.get('OptOutType')?.trim().toUpperCase();
  if (advanced === 'STOP' || advanced === 'START' || advanced === 'HELP') {
    return advanced;
  }

  const body = form.get('Body')?.trim().toUpperCase() ?? '';
  if (STOP_WORDS.has(body)) return 'STOP';
  if (START_WORDS.has(body)) return 'START';
  if (HELP_WORDS.has(body)) return 'HELP';
  return null;
}

function emptyTwiml(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const mediaType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== 'application/x-www-form-urlencoded') {
    return new Response('Unsupported media type', { status: 415 });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const receivingNumber = normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER);
  if (!authToken || !accountSid || !receivingNumber) {
    await reportOperationalError(
      'sms.inbound',
      new Error('Twilio inbound webhook is not configured'),
    );
    return new Response('Webhook unavailable', { status: 503 });
  }

  let form: URLSearchParams;
  let webhookUrl: string;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return new Response('Request too large', { status: 413 });
    form = new URLSearchParams(raw);
    webhookUrl = absoluteUrl('/api/sms/inbound');
  } catch (error) {
    await reportOperationalError('sms.inbound', error);
    return new Response('Webhook failed', { status: 500 });
  }
  const signature = request.headers.get('x-twilio-signature') ?? '';
  if (!isValidTwilioSignature({ authToken, signature, url: webhookUrl, form })) {
    return new Response('Invalid signature', { status: 403 });
  }

  // Bind this endpoint to the configured account and receiving number. A valid
  // signature from another Messaging Service in the same account must not be
  // able to mutate Switchboard's suppression list.
  if (
    form.get('AccountSid') !== accountSid
    || normalizePhoneNumber(form.get('To')) !== receivingNumber
  ) {
    return new Response('Invalid destination', { status: 403 });
  }

  const from = normalizePhoneNumber(form.get('From'));
  if (!from) return new Response('Invalid sender', { status: 400 });

  try {
    const action = optOutType(form);
    if (action === 'STOP') await recordSmsOptOut(from);
    if (action === 'START') await clearSmsOptOut(from);
    if (!action) {
      if (!smsDestinationAllowed(from)) return emptyTwiml();
      const parsed = parseSmsCommand(form.get('Body') ?? '');
      const sid = form.get('MessageSid') ?? '';
      if (!/^SM[0-9a-f]{32}$/i.test(sid)) return emptyTwiml();
      if (!(await checkRateLimit(`sms-inbound:${from}`, 20, 3600, { failClosed: true })) || !(await smsBudgetAllows(from))) return emptyTwiml();
      // Identity is established by Twilio's signed sender; the RPC additionally
      // binds the code to that phone, current verified account and exact invite.
      const { data, error } = await createAdminClient().rpc('handle_sms_command', { p_phone: from, p_command: parsed?.command ?? 'UNKNOWN', p_code: parsed?.code ?? '', p_sid: sid });
      if (error) throw error;
      if (!data) return emptyTwiml();
      const reply = data + (parsed?.command === 'JOIN' && data.startsWith('Subscribed') ? `\n${absoluteUrl(`/rsvp/${parsed.code}`)}` : '');
      const escaped = reply.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    }
    // Twilio Advanced Opt-Out sends its own STOP/START/HELP reply. Returning
    // empty TwiML avoids sending a duplicate application-authored message.
    return emptyTwiml();
  } catch (error) {
    await reportOperationalError('sms.inbound', error);
    return new Response('Webhook failed', { status: 500 });
  }
}
