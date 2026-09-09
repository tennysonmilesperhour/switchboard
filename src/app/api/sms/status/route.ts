import { reportOperationalError } from '@/lib/server/observability';
import { absoluteUrl } from '@/lib/links';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidTwilioSignature } from '@/lib/server/twilio-signature';

const RANK: Record<string, number> = { sending: 0, unknown: 0, accepted: 1, queued: 2, sending_provider: 3, sent: 4, failed: 5, undelivered: 5, delivered: 6 };
export async function POST(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const account = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!token || !account) return new Response('Unavailable', { status: 503 });
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return new Response('Unsupported media type', { status: 415 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return new Response('Invalid job', { status: 400 });
  const raw = await request.text();
  if (raw.length > 16000) return new Response('Too large', { status: 413 });
  const form = new URLSearchParams(raw);
  if (!isValidTwilioSignature({ authToken: token, signature: request.headers.get('x-twilio-signature') ?? '', url: absoluteUrl(`/api/sms/status?id=${id}`), form }) || form.get('AccountSid') !== account) return new Response('Forbidden', { status: 403 });
  const sid = form.get('MessageSid') ?? '';
  const status = form.get('MessageStatus') === 'sending' ? 'sending_provider' : form.get('MessageStatus') ?? '';
  if (!/^SM[0-9a-f]{32}$/.test(sid) || !(status in RANK) || ['sending','unknown'].includes(status)) return new Response('Invalid status', { status: 400 });
  const admin = createAdminClient();
  const code = form.get('ErrorCode');
  const { data: changed, error } = await admin.rpc('record_sms_status', { p_id: id, p_sid: sid, p_phone: form.get('To') ?? '', p_status: status, p_error: code && /^\d{4,6}$/.test(code) ? `twilio_${code}` : null });
  if (!error && changed && ['failed','undelivered'].includes(status)) await reportOperationalError('sms.delivery', new Error('Carrier did not deliver SMS'), { jobId: id, status, errorCode: code && /^\d{4,6}$/.test(code) ? code : null });
  return new Response(null, { status: error ? 503 : 204 });
}
