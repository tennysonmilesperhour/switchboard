import { NotificationNudge } from '@/components/shell/NotificationNudge';
import { hasInviteActivity } from '@/lib/notification-nudge';
import { createClient, getRenderUser } from '@/lib/supabase/server';

/** Server-side gate: a brand-new account is not asked for push permission. */
export async function InviteAwareNotificationNudge() {
  let eligible = false;
  try {
    const user = await getRenderUser();
    if (!user) return null;

    const supabase = await createClient();
    const [received, sent] = await Promise.all([
      supabase
        .from('invites')
        .select('id')
        .eq('invitee_id', user.id)
        .neq('status', 'queued')
        .limit(1),
      supabase
        .from('invite_delivery_attempts')
        .select('id')
        .limit(1),
    ]);
    if (received.error || sent.error) return null;

    eligible = hasInviteActivity(
      Boolean(received.data?.length),
      Boolean(sent.data?.length),
    );
  } catch {
    // Shell prompts are optional. Missing local configuration or a transient
    // auth/database failure must never replace the page with an error boundary.
    return null;
  }

  return eligible ? <NotificationNudge /> : null;
}
