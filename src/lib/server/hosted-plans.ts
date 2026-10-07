import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUsers, type NotificationPayload } from '@/lib/server/notify';
import { guestEmailHeaders, looksLikeEmail, sendEmails, type EmailMessage } from '@/lib/server/email';

/** Statuses of a plan someone could still be expecting to go to. */
export const LIVE_PLAN_STATUSES = ['draft', 'deciding', 'inviting', 'confirmed'] as const;

/**
 * The plans a person hosts that someone may still be counting on: not
 * cancelled, not past, and either undated or not yet started.
 */
export async function upcomingHostedPlans(
  client: SupabaseClient,
  hostId: string,
  now: Date = new Date(),
): Promise<{ id: string; title: string }[]> {
  const { data, error } = await client
    .from('events')
    .select('id, title')
    .eq('host_id', hostId)
    .in('status', [...LIVE_PLAN_STATUSES])
    .or(`starts_at.is.null,starts_at.gte.${now.toISOString()}`);
  if (error) throw new Error('Could not read hosted plans', { cause: error });
  return data ?? [];
}

/**
 * Snapshot recipients before deletion cascades the source rows away. This must
 * not send anything: storage cleanup or auth deletion can still fail.
 *
 * Deleting a single plan already refuses to erase one with accepted guests
 * until it is cancelled, "so nobody loses a commitment without receiving the
 * cancellation notice". Deleting the whole account removed every hosted plan
 * with no notice at all. Links point at /plans because the plan page will not
 * exist by the time anyone taps them.
 */
export interface HostedPlanCancellations {
  planCount: number;
  members: { userIds: string[]; payload: NotificationPayload }[];
  emails: EmailMessage[];
}

export async function prepareHostedPlanCancellations(
  admin: SupabaseClient,
  hostId: string,
): Promise<HostedPlanCancellations> {
  const plans = await upcomingHostedPlans(admin, hostId);
  if (plans.length === 0) return { planCount: 0, members: [], emails: [] };
  const titles = new Map(plans.map((plan) => [plan.id, plan.title]));
  const planIds = [...titles.keys()];

  const [{ data: invites, error: inviteError }, { data: cohosts, error: cohostError }] = await Promise.all([
    admin
      .from('invites')
      .select('event_id, invitee_id, guest_contact')
      .in('event_id', planIds)
      .eq('status', 'accepted'),
    admin.from('event_cohosts').select('event_id, cohost_id').in('event_id', planIds),
  ]);
  if (inviteError || cohostError) {
    throw new Error('Could not read hosted-plan recipients', { cause: inviteError ?? cohostError });
  }

  const members = new Map<string, Set<string>>();
  const add = (eventId: string, userId: string | null) => {
    if (!userId || userId === hostId) return;
    if (!members.has(eventId)) members.set(eventId, new Set());
    members.get(eventId)!.add(userId);
  };
  for (const invite of invites ?? []) add(invite.event_id, invite.invitee_id);
  for (const cohost of cohosts ?? []) add(cohost.event_id, cohost.cohost_id);

  const notices = [...members].map(([eventId, ids]) => ({
    userIds: [...ids],
    payload: {
      kind: 'event_cancelled',
      title: 'Plan cancelled',
      body: `${titles.get(eventId) ?? 'A plan'} is off. The host closed their Switchboard account.`,
      url: '/plans',
    },
  }));

  const emails = (invites ?? [])
    .filter((invite) => !invite.invitee_id && looksLikeEmail(invite.guest_contact))
    .map((invite) => {
      const title = titles.get(invite.event_id) ?? 'A plan';
      return {
        to: invite.guest_contact as string,
        subject: `Cancelled: ${title}`,
        text: `${title} is off. The host closed their Switchboard account, so the plan was removed with it.\n\n- Switchboard`,
        headers: guestEmailHeaders(),
      };
    });
  return { planCount: plans.length, members: notices, emails };
}

/** Call only after successful deletion. No reads of the now-deleted rows. */
export async function sendHostedPlanCancellations(snapshot: HostedPlanCancellations): Promise<void> {
  for (const notice of snapshot.members) {
    await notifyUsers(notice.userIds, notice.payload);
  }
  if (snapshot.emails.length > 0) await sendEmails(snapshot.emails);
}
