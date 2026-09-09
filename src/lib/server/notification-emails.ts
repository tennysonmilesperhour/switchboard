import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmailWithResult } from '@/lib/server/email';
import { absoluteUrl } from '@/lib/links';
import { safeNextPath } from '@/lib/security';
import { checkRateLimit } from '@/lib/server/rate-limit';

export async function sweepNotificationEmails(): Promise<number> {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc('claim_notification_emails');
  if (error) throw new Error('Notification email claim failed');
  let sent = 0;
  for (const job of jobs ?? []) {
    const [{ data: route, error: routeError }, { data: contact, error: contactError }, { data: notice, error: noticeError }] = await Promise.all([
      admin.from('notification_routes').select('plans, reminders').eq('user_id', job.user_id).maybeSingle(),
      admin.from('profile_contacts').select('normalized_value').eq('user_id', job.user_id).eq('kind', 'email').not('verified_at', 'is', null).maybeSingle(),
      admin.from('notifications').select('title, body, url').eq('id', job.notification_id).eq('user_id', job.user_id).maybeSingle(),
    ]);
    const category = job.category === 'reminders' ? 'reminders' : 'plans';
    let status: 'sent' | 'failed' | 'suppressed' = 'suppressed';
    if (!routeError && !contactError && !noticeError && route?.[category] === 'email' && contact?.normalized_value === job.email && notice && Date.parse(job.expires_at) > Date.now()
      && await checkRateLimit(`notification-email:${job.user_id}`, 12, 86400, { failClosed: true })
      && await checkRateLimit('notification-email-global', 100, 86400, { failClosed: true })) {
      const result = await sendEmailWithResult({ to: job.email, subject: notice.title.slice(0, 150), text: `${notice.body}\n\n${absoluteUrl(safeNextPath(notice.url, '/notifications'))}\n\nManage notifications: ${absoluteUrl('/settings')}` });
      status = result.status === 'sent' ? 'sent' : 'failed';
      if (status === 'sent') sent++;
    }
    const { error: writeError } = await admin.from('notification_email_jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'sending');
    if (writeError) throw new Error('Notification email receipt write failed');
  }
  return sent;
}
