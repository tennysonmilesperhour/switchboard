import 'server-only';
import { reportOperationalError } from '@/lib/server/observability';
import { createAdminClient } from '@/lib/supabase/admin';
import { absoluteUrl } from '@/lib/links';
import { sendSmsWithResult } from '@/lib/server/sms';

export async function sweepSmsJobs(): Promise<number> {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc('claim_sms_jobs');
  if (error) throw new Error('SMS queue claim failed');
  let accepted = 0;
  for (const job of jobs ?? []) {
    const lines = (job.body ?? '').split('\n');
    const path = lines.pop() ?? '/notifications';
    const body = `${lines.join('\n').slice(0, 200)}\n${absoluteUrl(path)}\nReply STOP to unsubscribe.`;
    const result = await sendSmsWithResult({ to: job.phone, body,
      category: job.category === 'reminders' ? 'reminders' : 'plans', jobId: job.id, recipientUserId: job.user_id ?? undefined, expiresAt: job.expires_at });
    // Only an explicit rate-limit rejection is safe to retry. Timeouts and
    // connection errors may have created a message, so must never auto-resend.
    const retry = (result.errorCode === 'http_429' || result.errorCode === 'twilio_20429') && job.attempts < 3;
    const uncertain = ['timeout','network_error','invalid_response'].includes(result.errorCode ?? '');
    const status = retry ? 'pending' : result.status === 'sent' ? 'accepted' : uncertain ? 'unknown' : 'failed';
    const { error: updateError } = await admin.from('sms_jobs').update({
      status, provider_message_id: result.providerMessageId ?? null,
      error_code: result.errorCode ?? null, body: retry ? job.body : null,
      available_at: new Date(Date.now() + job.attempts * 60000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('status', 'sending');
    if (updateError) throw new Error('SMS queue result write failed');
    if (result.status === 'sent') accepted++;
    if (status === 'failed' || status === 'unknown') await reportOperationalError('sms.delivery', new Error('SMS job failed'), { errorCode: result.errorCode ?? null, jobId: job.id, recipientUserId: job.user_id ?? undefined, expiresAt: job.expires_at });
  }
  return accepted;
}
