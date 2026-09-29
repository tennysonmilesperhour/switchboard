import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { reportOperationalError } from '@/lib/server/observability';
import { guestEmailHeaders, looksLikeEmail, sendEmailWithResult } from '@/lib/server/email';
import { normalizePhoneNumber, sendSmsWithResult, smsEnabled } from '@/lib/server/sms';
import { smsConsentAllows } from '@/lib/server/sms-policy';
import { consumeEventOutboundSlot } from '@/lib/server/invite-delivery-limit';
import {
  countDelivery,
  emptyDeliverySummary,
  type DeliveryAttemptRow,
  type InvitationDeliverySummary,
} from '@/lib/server/cascade-runner';
import { eventShareUrl } from '@/lib/links';
import { hostCanShare, shareLinkState } from '@/lib/share-link';
import { formatDateTime } from '@/lib/format';
import { pollQuestion } from '@/lib/types';
import { pollOptionLabel } from '@/components/polls/option-label';
import {
  cleanSeedOptions,
  decidingGuestEmail,
  decidingGuestSms,
  pollAudience,
  pollOpenedNotice,
  pollOutcomeNotices,
  type DateOutcome,
  type OpenedReason,
} from '@/lib/poll-notices';

type Admin = ReturnType<typeof createAdminClient>;

interface PlanContext {
  event: {
    id: string;
    title: string;
    host_id: string;
    status: string;
    starts_at: string | null;
    time_zone: string | null;
    share_token: string;
    share_link_active: boolean;
  };
  hostName: string | null;
  invites: Array<{
    id: string;
    invitee_id: string | null;
    status: string;
    guest_name: string | null;
    guest_contact: string | null;
  }>;
  managers: string[];
  guests: string[];
}

/**
 * The plan a poll belongs to and the people it is put to, read with the
 * service role. Only ever called after the caller was authorised (a host or
 * co-host action) or from the cron, and it only decides who to notify.
 */
async function planContext(admin: Admin, eventId: string): Promise<PlanContext | null> {
  const [{ data: event, error: eventError }, { data: cohosts }, { data: invites, error: inviteError }] =
    await Promise.all([
      admin
        .from('events')
        .select('id, title, host_id, status, starts_at, time_zone, share_token, share_link_active')
        .eq('id', eventId)
        .maybeSingle(),
      admin.from('event_cohosts').select('cohost_id').eq('event_id', eventId),
      admin
        .from('invites')
        .select('id, invitee_id, status, guest_name, guest_contact')
        .eq('event_id', eventId),
    ]);
  if (eventError) throw eventError;
  if (inviteError) throw inviteError;
  if (!event) return null;
  const { data: host } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', event.host_id)
    .maybeSingle();
  const audience = pollAudience({
    eventStatus: event.status,
    hostId: event.host_id,
    cohostIds: (cohosts ?? []).map((row) => row.cohost_id),
    invites: invites ?? [],
  });
  return { event, hostName: host?.display_name ?? null, invites: invites ?? [], ...audience };
}

/**
 * Tell the group a poll is open: a follow-up that unlocked, or a runoff whose
 * fresh ballot needs everyone again. Best-effort; the poll is open either way.
 */
export async function notifyPollOpened(
  pollId: string,
  reason: OpenedReason,
  actorId?: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: poll } = await admin
      .from('polls')
      .select('id, event_id, topic, title')
      .eq('id', pollId)
      .maybeSingle();
    if (!poll) return;
    const plan = await planContext(admin, poll.event_id);
    if (!plan) return;
    const recipients = [...plan.managers, ...plan.guests].filter((id) => id !== actorId);
    if (recipients.length === 0) return;
    await notifyUsers(
      recipients,
      pollOpenedNotice({
        eventId: plan.event.id,
        eventTitle: plan.event.title,
        question: pollQuestion({ topic: poll.topic, title: poll.title }),
        reason,
        hostName: plan.hostName,
        needsDate: !plan.event.starts_at,
      }),
    );
  } catch (error) {
    await reportOperationalError('poll.notify', error, { pollId, reason });
  }
}

/**
 * Tell everyone a poll was put to how it came out, and tell the host and
 * co-hosts what that leaves them to do (pick, set the date, or send).
 *
 * `actorId` is whoever closed or picked it by hand; they already know. The
 * deadline sweep has no actor, which is exactly the case that used to tell
 * nobody at all. Best-effort: the decision is saved either way.
 */
export async function notifyPollOutcome(
  pollId: string,
  { date, actorId }: { date: DateOutcome; actorId?: string | null },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: poll } = await admin
      .from('polls')
      .select('id, event_id, topic, title, winning_option_id')
      .eq('id', pollId)
      .maybeSingle();
    if (!poll) return;
    const [plan, { data: options }] = await Promise.all([
      planContext(admin, poll.event_id),
      admin.from('poll_options').select('id, label').eq('poll_id', pollId),
    ]);
    if (!plan) return;
    const zone = date.kind === 'set' ? date.timeZone : plan.event.time_zone;
    const winner = (options ?? []).find((option) => option.id === poll.winning_option_id);
    const notices = pollOutcomeNotices({
      eventId: plan.event.id,
      eventTitle: plan.event.title,
      question: pollQuestion({ topic: poll.topic, title: poll.title }),
      hostName: plan.hostName,
      winnerLabel: winner ? pollOptionLabel(winner.label, zone) : null,
      ideas: (options ?? []).length,
      deciding: plan.event.status === 'deciding',
      hasDate: Boolean(plan.event.starts_at),
      date,
      dateText: date.kind === 'set' ? formatDateTime(date.startsAt, date.timeZone) : null,
    });
    const notActor = (id: string) => id !== actorId;
    const guests = plan.guests.filter(notActor);
    const managers = plan.managers.filter(notActor);
    await Promise.all([
      notices.guests && guests.length > 0 ? notifyUsers(guests, notices.guests) : null,
      managers.length > 0 ? notifyUsers(managers, notices.managers) : null,
    ]);
  } catch (error) {
    await reportOperationalError('poll.notify', error, { pollId, stage: 'outcome' });
  }
}

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Put the ideas the host floated in the wizard on the plan's first poll.
 *
 * Through the host's own session, so the `poll_options_insert` policy applies
 * exactly as it does to the suggestion box. The plan already exists by now, so
 * a failure is logged with its code and the plan goes ahead: the host sees the
 * poll without those ideas and can add them there.
 */
async function seedFirstPoll(
  supabase: SessionClient,
  eventId: string,
  userId: string,
  raw: unknown,
): Promise<void> {
  const ideas = cleanSeedOptions(raw);
  if (ideas.length === 0) return;
  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .select('id')
    .eq('event_id', eventId)
    .is('parent_poll_id', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  const { error } = poll
    ? await supabase.from('poll_options').insert(
        ideas.map((idea) => ({
          poll_id: poll.id,
          label: idea.label,
          link_url: idea.linkUrl,
          author_id: userId,
          source: 'host',
        })),
      )
    : { error: pollError ?? new Error('The new plan has no poll to seed.') };
  if (error) await reportOperationalError('poll.seed', error, { eventId, ideas: ideas.length });
}

/**
 * Everything a plan that starts as a vote does once it exists (decision D4).
 *
 * Seeds the host's ideas, then tells the people on the list there is a vote:
 * account-holders in the app (and by push, where they allow it), and guests
 * with an email address — or a phone that has opted in — the plan's share link
 * with "help pick the date", once, here. Nothing else ever sends it again; the
 * invitation proper follows when the host presses "Send the invitations".
 *
 * Returns what reached whom, in the same shape as a first invitation wave, so
 * the wizard can say when a channel needs attention.
 */
export async function openDecidingPlan(
  supabase: SessionClient,
  eventId: string,
  userId: string,
  pollOptions: unknown,
): Promise<InvitationDeliverySummary> {
  await seedFirstPoll(supabase, eventId, userId, pollOptions);

  const admin = createAdminClient();
  const summary = emptyDeliverySummary();
  const plan = await planContext(admin, eventId);
  if (!plan || plan.event.host_id !== userId) return summary;
  const { data: poll } = await admin
    .from('polls')
    .select('topic, title')
    .eq('event_id', eventId)
    .is('parent_poll_id', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  const needsDate = !plan.event.starts_at;

  if (plan.guests.length > 0) {
    const result = await notifyUsers(
      plan.guests,
      pollOpenedNotice({
        eventId,
        eventTitle: plan.event.title,
        question: pollQuestion({ topic: poll?.topic ?? 'custom', title: poll?.title ?? null }),
        reason: 'created',
        hostName: plan.hostName,
        needsDate,
      }),
    );
    for (let i = 0; i < plan.guests.length; i += 1) {
      countDelivery(summary, result.recorded ? 'sent' : 'failed');
    }
  }

  // The link is only handed out when the recipient page will open it: the
  // same rule as every Share button (share-link.ts, hostCanShare ⊆ canReadPlan).
  const shareUrl = hostCanShare(shareLinkState(plan.event)) ? eventShareUrl(plan.event.share_token) : null;
  const attempts: DeliveryAttemptRow[] = [];
  const offPlatform = plan.invites.filter((invite) => !invite.invitee_id && invite.status === 'queued');
  await Promise.all(
    offPlatform.map(async (invite) => {
      const contact = invite.guest_contact?.trim() ?? '';
      const phone = looksLikeEmail(contact) ? null : normalizePhoneNumber(contact);
      const channel = looksLikeEmail(contact) ? 'email' : phone ? 'sms' : null;
      // A phone number typed by the host is not consent. Only a guest who has
      // opted in themselves may be texted; everyone else is the host's to
      // share the link with, which is what "manual" tells the wizard.
      const reachable =
        shareUrl &&
        (channel === 'email' ||
          (channel === 'sms' && phone && smsEnabled() &&
            (await smsConsentAllows(phone, 'plans', undefined, invite.id))));
      if (!reachable || !channel) {
        summary.manual += 1;
        return;
      }
      if (!(await consumeEventOutboundSlot(plan.event.host_id, 'invitation'))) {
        countDelivery(summary, 'failed');
        attempts.push({
          invite_id: invite.id, channel, status: 'failed', provider: 'switchboard',
          provider_message_id: null, error_code: 'host_daily_limit',
        });
        return;
      }
      const copy = { hostName: plan.hostName, eventTitle: plan.event.title, needsDate, shareUrl };
      const result = phone
        ? await sendSmsWithResult({
            to: phone,
            body: decidingGuestSms(copy),
            category: 'plans',
            guestInviteId: invite.id,
          })
        : await sendEmailWithResult({
            to: contact,
            ...decidingGuestEmail({ ...copy, guestName: invite.guest_name }),
            headers: guestEmailHeaders(),
          });
      countDelivery(summary, result.status);
      attempts.push({
        invite_id: invite.id,
        channel,
        status: result.status,
        provider: result.provider,
        provider_message_id: result.providerMessageId ?? null,
        error_code: result.errorCode ?? null,
      });
    }),
  );

  if (attempts.length > 0) {
    const { error } = await admin.from('invite_delivery_attempts').insert(attempts);
    if (error) console.error('[invite-delivery:record]', error.message);
  }
  return summary;
}

/**
 * Tell everyone who already said yes that the plan now has a date.
 *
 * Only sent once the plan has one: "Send the invitations" now requires a date
 * (`invitationStep`), so this always names it — in the plan's own zone, since
 * a notification has no viewer zone and would otherwise announce the server's
 * UTC.
 */
export async function notifyDateSettled(eventId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, starts_at, time_zone')
    .eq('id', eventId)
    .maybeSingle();
  if (!event?.starts_at) return;

  const { data: accepted } = await admin
    .from('invites')
    .select('invitee_id')
    .eq('event_id', eventId)
    .eq('status', 'accepted')
    .not('invitee_id', 'is', null);
  const recipients = (accepted ?? [])
    .map((row) => row.invitee_id as string | null)
    .filter((id): id is string => Boolean(id));
  if (recipients.length === 0) return;

  await notifyUsers(recipients, {
    kind: 'event_date_set',
    title: 'The date is set 📅',
    body: `${event.title} is happening ${formatDateTime(event.starts_at, event.time_zone)}.`,
    url: `/events/${event.id}`,
  });
}
