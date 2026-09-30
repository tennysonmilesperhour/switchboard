import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { reportOperationalError } from '@/lib/server/observability';
import { ritualReminderNotice } from '@/lib/rituals';

/** How many reminders one sweep sends at most; the next tick takes the rest. */
export const RITUAL_REMINDER_BATCH = 100;

/**
 * Remind both people on the day a standing ritual is due (decision D8). Runs
 * inside the cascade cron.
 *
 * `claim_ritual_reminders` decides who is due and records them as reminded in
 * one statement, so however often this runs, and even if two runs overlap,
 * each person hears once per ritual per due date. It holds a reminder until the
 * person's own due day has started and they are outside quiet hours, and skips
 * blocked pairs and anyone on sabbatical. The notification is kind `ritual`,
 * so the "Connections & matches" switch and the daily digest apply to the push
 * like any other; the inbox row is always written.
 *
 * Never throws: a failed claim sends nothing and records nothing, so the next
 * tick simply tries again, and the rest of the cron's work is unaffected.
 */
export async function sweepRitualReminders(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('claim_ritual_reminders', {
    p_limit: RITUAL_REMINDER_BATCH,
  });
  if (error) {
    await reportOperationalError('ritual.remind', error, { stage: 'claim' });
    return 0;
  }

  let sent = 0;
  for (const row of data ?? []) {
    const notice = ritualReminderNotice(row.activity, row.other_name);
    const result = await notifyUsers([row.user_id], { kind: 'ritual', ...notice });
    if (result.recorded) sent += 1;
  }
  return sent;
}
