import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signMediaRef } from '@/lib/server/media';
import { isValidTimeZone } from '@/lib/server/event-zone';
import { getRelationship, getMutualConnections } from '@/lib/server/relationship';
import { loadAvailability } from '@/lib/actions/availability';
import type { CalendarStatus } from '@/lib/actions/calendar-sync';
import { threadGate, THREAD_PREVIEW_COUNT } from '@/lib/engine/thread';
import { formatDateTimeRange } from '@/lib/format';
import { appOrigin, eventShareUrl, guestRsvpUrl } from '@/lib/links';
import { likeLiteral } from '@/lib/security';
import { sabbaticalOf, type SabbaticalStatus } from '@/lib/sabbatical';
import {
  hostCanEditInvitees,
  hostCanShare,
  shareLinkState,
} from '@/lib/share-link';
import { INVITE_STATUS_LABEL, normalizeInviteStatus } from '@/lib/invite-status';
import {
  appInviteMessage,
  looksLikeContactString,
  planInviteMessage,
} from '@/lib/invitee-contact';
import type { AvailabilitySnapshot } from '@/lib/availability';
import { busyBandsFromStored } from '@/lib/availability';
import type { Weight } from '@/lib/engine/scoring';
import type {
  EventQuestion,
  Invite,
  Poll,
  PollOption,
  SwitchboardEvent,
} from '@/lib/types';
import type { InviteePerson } from '@/components/events/InviteeSheet';
import type { HostCardData } from '@/components/events/HostCard';
import type { PendingParentalApproval } from '@/components/events/ParentalApprovalManager';
import type { AnnouncementView } from '@/components/events/Announcements';
import type { ThreadCommentView } from '@/components/events/EventThread';
import type { OptionResult } from '@/components/polls/PollSection';
import { readyToSendInvitations } from '@/lib/poll-readiness';
import { reportOperationalError } from '@/lib/server/observability';
import { guardianStepFor, type GuardianRequestView } from '@/lib/guardian-approval';
import { groupAnswersByInvite, type GuestAnswers } from '@/lib/event-answers';
import {
  cohostCandidates,
  hostGuardianQueue,
  inviteListPeople,
  type InviteListRow,
} from '@/lib/event-people';

export type EventPageInvite = Invite & {
  invitee_name: string;
  invitee_handle: string | null;
  invitee_avatar_url: string | null;
  deliveries?: Array<{
    channel: 'in_app' | 'email' | 'sms';
    status: string;
  }>;
};

type EventHostProfile = HostCardData & { timezone: string | null };
type EventWithHost = SwitchboardEvent & {
  host: EventHostProfile | EventHostProfile[] | null;
};

export interface EventPageAttendee {
  id: string;
  inviteId: string;
  inviteeId: string | null;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  guestToken: string | null;
  guestContact: string | null;
  status: Invite['status'];
}

export interface EventPageData {
  event: SwitchboardEvent;
  eventZone: string | null;
  shareState: ReturnType<typeof shareLinkState>;
  isHost: boolean;
  canManage: boolean;
  cohosts: Array<{ id: string; name: string }>;
  /** One-tap co-host picks for the primary host (decision D1). */
  cohostCandidates: Array<{ id: string; name: string; handle: string }>;
  hostCard: {
    host: HostCardData;
    relationship: Awaited<ReturnType<typeof getRelationship>>;
    mutuals: Awaited<ReturnType<typeof getMutualConnections>>;
  } | null;
  hostInvites: EventPageInvite[];
  /** Every RSVP waiting on a guardian, asked or not. Host/co-host only. */
  pendingParentalApprovals: PendingParentalApproval[];
  myInvite: Invite | null;
  /**
   * The viewer's own guardian step: their yes is held (`pending_approval`), or
   * a guardian turned it down. Null for everyone else.
   */
  guardianStep: { request: GuardianRequestView | null } | null;
  /** "Who's invited", when the host shows it (`event_invite_list`). Guests only. */
  inviteList: InviteePerson[];
  addableConnections: Array<{
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
    sabbatical: SabbaticalStatus | null;
  }>;
  attendees: EventPageAttendee[];
  /**
   * Whether this viewer has a Give Space heads-up on this plan.
   *
   * A stored boolean, read back — never recomputed here. The decision is made
   * once, by `note_give_space_overlap`, at the moment the viewer accepts an
   * invitation; see `20260916210002_give_space_notices.sql` for why opening a
   * page may not ask this question and why the answer never withdraws itself.
   */
  giveSpaceNotice: boolean;
  poll: Poll | null;
  decidedPolls: Poll[];
  pendingPolls: Poll[];
  /** Whether "Send the invitations" may run; `startInviting` asks the same. */
  invitationsReady: boolean;
  availability: AvailabilitySnapshot;
  calendarBusy: string[];
  calendarStatus: CalendarStatus | null;
  allDecidedWinners: Record<string, string>;
  options: PollOption[];
  results: OptionResult[];
  myVotes: Record<string, Weight>;
  venuePerk: { name: string; perk: string } | null;
  questions: EventQuestion[];
  announcements: AnnouncementView[];
  canAccessThread: boolean;
  threadTotal: number;
  threadGateInfo: ReturnType<typeof threadGate>;
  threadComments: ThreadCommentView[];
  acceptedCount: number;
  answersByGuest: GuestAnswers[];
  calendarEvent: {
    title: string;
    description: string | null;
    location: string | null;
    startsAt: string;
    endsAt: string | null;
  } | null;
  guestLinks: Array<{ name: string; contact: string | null; url: string }>;
  inviteeCards: Record<string, InviteePerson>;
  attendeeCards: InviteePerson[];
  cancelVoiceUrl: string | null;
}

/** The plan exists for this viewer or not, but the read itself failed. */
export const EVENT_PAGE_UNAVAILABLE = 'unavailable' as const;

/**
 * Load the event detail page without its old twenty-query waterfall.
 *
 * The event row is the RLS authorization preflight. Every remaining read is in
 * one of two dependency phases: phase one establishes capabilities and shared
 * page facts; phase two loads only the branches those facts permit. No
 * service-role result is returned unless the authenticated viewer's role and
 * the plan's visibility settings authorize that exact field.
 */
export async function loadEventPage(
  id: string,
  user: User,
): Promise<EventPageData | null | typeof EVENT_PAGE_UNAVAILABLE> {
  const supabase = await createClient();
  const { data: eventWithHost, error: eventError } = await supabase
    .from('events')
    .select(
      '*, host:profiles!events_host_id_fkey(id, display_name, handle, avatar_url, tagline, timezone)',
    )
    .eq('id', id)
    .single<EventWithHost>();
  // No row (PGRST116) is how RLS answers "not yours to see", and the page sends
  // that viewer to /join. Any other error is the database failing: sending a
  // host to /join then told them they had lost their own plan.
  if (eventError && eventError.code !== 'PGRST116') {
    await reportOperationalError('event-page.load', eventError, { eventId: id }, 'SB-PLAN-OPEN');
    return EVENT_PAGE_UNAVAILABLE;
  }
  if (!eventWithHost) return null;

  const { host: hostRaw, ...eventFields } = eventWithHost;
  const hostProfile = Array.isArray(hostRaw) ? hostRaw[0] : hostRaw;
  const event = eventFields as SwitchboardEvent;

  const admin = createAdminClient();
  const isHost = event.host_id === user.id;
  const shareState = shareLinkState(event);
  const relationshipPromise = isHost
    ? Promise.resolve(null)
    : getRelationship(supabase, user.id, event.host_id);
  const mutualsPromise = isHost
    ? Promise.resolve(null)
    : getMutualConnections(admin, user.id, event.host_id);
  const calendarBusyPromise = event.starts_at
    ? Promise.resolve({ data: [] as Array<{ slot: string }> })
    : supabase
        .from('calendar_busy')
        .select('slot')
        .eq('user_id', user.id);
  const calendarStatusPromise = event.starts_at
    ? Promise.resolve({ data: null })
    : supabase.rpc('calendar_subscription_status');
  const venuePromise = event.location_name
    ? supabase
        .from('venues')
        .select('name, perk')
        .eq('status', 'verified')
        .ilike('name', likeLiteral(event.location_name.trim()))
        .limit(1)
        .maybeSingle<{ name: string; perk: string }>()
    : Promise.resolve({ data: null as { name: string; perk: string } | null });

  // Phase one: all reads depend only on the authorized event and viewer.
  const [
    cohostResult,
    myInviteResult,
    relationship,
    mutuals,
    pollResult,
    availability,
    calendarBusyResult,
    calendarStatusResult,
    questionResult,
    announcementResult,
    venueResult,
  ] = await Promise.all([
    admin
      .from('event_cohosts')
      .select(
        'cohost_id, cohost:profiles!event_cohosts_cohost_id_fkey(display_name)',
      )
      .eq('event_id', id),
    isHost
      ? Promise.resolve({ data: null as Invite | null })
      : supabase
          .from('invites')
          .select('*')
          .eq('event_id', id)
          .eq('invitee_id', user.id)
          .maybeSingle<Invite>(),
    relationshipPromise,
    mutualsPromise,
    supabase
      .from('polls')
      .select('*')
      .eq('event_id', id)
      .order('created_at')
      .order('id')
      .returns<Poll[]>(),
    loadAvailability(id),
    calendarBusyPromise,
    calendarStatusPromise,
    supabase
      .from('event_questions')
      .select('*')
      .eq('event_id', id)
      .order('position')
      .returns<EventQuestion[]>(),
    supabase
      .from('announcements')
      .select('id, body, created_at, author:profiles(display_name)')
      .eq('event_id', id)
      .order('created_at', { ascending: false }),
    venuePromise,
  ]);

  const cohostIds = (cohostResult.data ?? []).map((row) => row.cohost_id as string);
  const canManage = isHost || cohostIds.includes(user.id);
  // A co-host is often also an invitee (D1). Hiding their invitation left them
  // no way to answer it, and on a timed line it lapsed to "No response". The
  // primary host never holds one.
  const myInvite = isHost ? null : myInviteResult.data;
  const eventZone = isValidTimeZone(event.time_zone)
    ? event.time_zone
    : isValidTimeZone(hostProfile?.timezone)
      ? hostProfile.timezone
      : null;
  // Stored busy time is 15-minute blocks; map them onto the same zone's bands
  // the grid shows (`timeZone={event.time_zone}` on the plan page).
  const calendarBusy = event.starts_at
    ? []
    : busyBandsFromStored(
        (calendarBusyResult.data ?? []).map((row) => row.slot),
        event.time_zone,
      );
  const calendarRow = Array.isArray(calendarStatusResult.data)
    ? calendarStatusResult.data[0]
    : null;
  const coveredThrough = calendarRow?.covered_through ?? null;
  const calendarStatus: CalendarStatus | null = event.starts_at
    ? null
    : calendarRow
      ? {
          connected: true,
          sourceHost: calendarRow.source_host ?? null,
          lastSyncedAt: calendarRow.last_synced_at ?? null,
          lastStatus: calendarRow.last_status ?? null,
          coveredThrough,
          usable: calendarRow.last_status === 'ok' && Boolean(coveredThrough),
        }
      : {
          connected: false,
          sourceHost: null,
          lastSyncedAt: null,
          lastStatus: null,
          coveredThrough: null,
          usable: false,
        };
  const cohosts = isHost
    ? (cohostResult.data ?? []).map((row) => {
        const profile = Array.isArray(row.cohost) ? row.cohost[0] : row.cohost;
        return {
          id: row.cohost_id as string,
          name: profile?.display_name ?? 'Co-host',
        };
      })
    : [];
  const allPolls = pollResult.data ?? [];
  const poll =
    allPolls.find((row) => row.phase !== 'decided' && row.phase !== 'pending') ??
    [...allPolls].reverse().find((row) => row.phase === 'decided') ??
    null;
  const decidedPolls = allPolls.filter(
    (row) => row.phase === 'decided' && row.id !== poll?.id,
  );
  const pendingPolls = allPolls.filter((row) => row.phase === 'pending');
  const questions = questionResult.data ?? [];
  const canAccessThread = canManage || myInvite?.status === 'accepted';
  const winnerIds = decidedPolls
    .map((row) => row.winning_option_id)
    .filter((optionId): optionId is string => Boolean(optionId));
  const promptById = new Map(questions.map((question) => [question.id, question.prompt]));

  let commentsQuery = admin
    .from('event_comments')
    .select(
      'id, body, voice_url, voice_duration_seconds, created_at, author_id, reply_to_id, author:profiles(display_name)',
      { count: 'exact' },
    )
    .eq('event_id', id)
    .order('created_at', { ascending: true });
  if (!canAccessThread) commentsQuery = commentsQuery.limit(THREAD_PREVIEW_COUNT);

  // Phase two: capability-dependent reads, still issued as one parallel batch.
  const [
    hostInviteResult,
    attendeeResult,
    connectionResult,
    winnerResult,
    optionResult,
    pollResultRows,
    voteResult,
    commentResult,
    answerResult,
    hiddenAcceptedCountResult,
    giveSpaceResult,
    cancelVoiceUrl,
    parentalApprovalResult,
    myGuardianResult,
    inviteListResult,
  ] = await Promise.all([
    canManage
      ? admin
          .from('invites')
          .select(
            '*, invitee:profiles(display_name, handle, avatar_url), delivery_attempts:invite_delivery_attempts(channel, status, attempted_at)',
          )
          .eq('event_id', id)
          .order('position')
      : Promise.resolve({ data: [] }),
    !canManage && event.show_accepted
      ? admin
          .from('invites')
          .select(
            'id, invitee_id, guest_name, guest_contact, guest_token, status, invitee:profiles(display_name, handle, avatar_url)',
          )
          .eq('event_id', id)
          .eq('status', 'accepted')
      : Promise.resolve({ data: [] }),
    canManage && hostCanEditInvitees(event.status)
      ? supabase
          .from('connections')
          .select(
            'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle, avatar_url, sabbatical, sabbatical_message), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle, avatar_url, sabbatical, sabbatical_message)',
          )
          .eq('status', 'accepted')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      : Promise.resolve({ data: [] }),
    winnerIds.length > 0
      ? supabase
          .from('poll_options')
          .select('id, label, poll_id')
          .in('id', winnerIds)
      : Promise.resolve({ data: [] }),
    poll
      ? supabase.from('poll_options').select('*').eq('poll_id', poll.id)
      : Promise.resolve({ data: [] }),
    poll
      ? supabase.rpc('poll_results', { p_poll: poll.id })
      : Promise.resolve({ data: [] }),
    poll
      ? supabase
          .from('poll_votes')
          .select('option_id, weight')
          .eq('poll_id', poll.id)
          .eq('voter_id', user.id)
      : Promise.resolve({ data: [] }),
    commentsQuery,
    isHost && promptById.size > 0
      ? admin
          .from('invite_answers')
          .select(
            'invite_id, question_id, answer, invite:invites(guest_name, invitee:profiles(display_name))',
          )
          .in('question_id', [...promptById.keys()])
      : Promise.resolve({ data: [] }),
    !canManage && !event.show_accepted
      ? admin
          .from('invites')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', id)
          .eq('status', 'accepted')
      : Promise.resolve({ count: 0 }),
    // The viewer's own frozen notice row. Owner-scoped by RLS, and a plain
    // read: it carries one boolean and is not gated on `show_accepted`,
    // because it describes a decision already taken rather than who is here
    // now.
    supabase
      .from('give_space_notices')
      .select('warned')
      .eq('user_id', user.id)
      .eq('event_id', id)
      .maybeSingle(),
    signMediaRef(event.cancel_voice_url),
    // Host/co-host recovery for a request that is waiting on a guardian. These
    // addresses are private and cross the server/client boundary only inside
    // the same `canManage` gate used for the host's invite contact cards.
    canManage && event.parental_approval
      ? admin
          .from('parental_approvals')
          .select('invite_id, guardian_email, guardian_name, email_status')
          .eq('event_id', id)
          .eq('status', 'pending')
      : Promise.resolve({ data: [] }),
    // The viewer's own guardian requests, scoped to the invite RLS just
    // returned as theirs. Masked before it leaves the server.
    !canManage && myInvite && event.parental_approval
      ? admin
          .from('parental_approvals')
          .select('status, guardian_email, created_at, email_status')
          .eq('event_id', id)
          .eq('invite_id', myInvite.id)
      : Promise.resolve({ data: [] }),
    // Read as the viewer: the definer function decides from the flag, the
    // viewer's access, and each invite's status (never queued, declined, or
    // expired), so nothing here needs trusting.
    !canManage && event.show_invite_list
      ? supabase.rpc('event_invite_list', { p_event: id })
      : Promise.resolve({ data: [] as InviteListRow[] }),
  ]);

  // Only hosts/co-hosts reach this read; return delivery status, never numbers or bodies.
  const inviteIdsForSms = (hostInviteResult.data ?? []).map(row => row.id);
  const smsReceipts = canManage && inviteIdsForSms.length
    ? await admin.from('sms_jobs').select('invite_id, status, created_at').in('invite_id', inviteIdsForSms).order('created_at', { ascending: false })
    : { data: [] };

  const hostInvites: EventPageInvite[] = (hostInviteResult.data ?? []).map((row) => {
    const {
      invitee: profileRaw,
      delivery_attempts: deliveryRowsRaw,
      ...inviteFields
    } = row;
    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
    const latestByChannel = new Map<
      string,
      NonNullable<EventPageInvite['deliveries']>[number]
    >();
    const deliveryRows = [...(deliveryRowsRaw ?? [])].sort(
      (left, right) =>
        new Date(right.attempted_at).getTime() - new Date(left.attempted_at).getTime(),
    );
    for (const attempt of deliveryRows) {
      if (latestByChannel.has(attempt.channel)) continue;
      latestByChannel.set(attempt.channel, {
        channel: attempt.channel as 'in_app' | 'email' | 'sms',
        status: attempt.status as
          | 'sent'
          | 'not_configured'
          | 'invalid_recipient'
          | 'opted_out'
          | 'failed',
      });
    }
    const smsReceipt = smsReceipts.data?.find(receipt => receipt.invite_id === inviteFields.id);
    if (smsReceipt) latestByChannel.set('sms', { channel: 'sms', status: smsReceipt.status });
    return {
      ...(inviteFields as Invite),
      invitee_name: profile?.display_name ?? inviteFields.guest_name ?? 'Guest',
      invitee_handle: (profile?.handle as string | null) ?? null,
      invitee_avatar_url: (profile?.avatar_url as string | null) ?? null,
      deliveries: [...latestByChannel.values()],
    };
  });

  const pendingParentalApprovals: PendingParentalApproval[] = canManage
    ? hostGuardianQueue(hostInvites, parentalApprovalResult.data ?? [])
    : [];
  const guardianStep = guardianStepFor(myInvite?.status, myGuardianResult.data ?? []);

  const invitedIds = new Set(
    hostInvites
      .map((invite) => invite.invitee_id)
      .filter((inviteeId): inviteeId is string => Boolean(inviteeId)),
  );
  const addableConnections: EventPageData['addableConnections'] = [];
  for (const row of connectionResult.data ?? []) {
    const isRequester = row.requester_id === user.id;
    const otherRaw = isRequester ? row.addressee : row.requester;
    const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
    if (!other || invitedIds.has(other.id)) continue;
    addableConnections.push({
      id: other.id,
      name: other.display_name ?? 'Friend',
      handle: other.handle ?? '',
      avatarUrl: other.avatar_url ?? null,
      sabbatical: sabbaticalOf(other),
    });
  }

  const attendeeRows = canManage
    ? (hostInviteResult.data ?? []).filter((row) => row.status === 'accepted')
    : (attendeeResult.data ?? []);
  const attendees: EventPageAttendee[] = attendeeRows.map((row) => {
    const profile = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;
    // A guest added by email or phone has that address as their "name". Only
    // the host's side may show it; a guest reads "Guest", as `event_invite_list`
    // does. Contacts and RSVP tokens are host-only (docs/SECURITY.md).
    const rawGuestName = row.guest_name?.trim() ?? '';
    const guestNameIsContact =
      rawGuestName === (row.guest_contact?.trim() ?? '') || looksLikeContactString(rawGuestName);
    return {
      id: row.invitee_id ?? row.id,
      inviteId: row.id as string,
      inviteeId: (row.invitee_id as string | null) ?? null,
      name: profile?.display_name ?? (canManage || !guestNameIsContact ? row.guest_name : null) ?? 'Guest',
      handle: (profile?.handle as string | null) ?? null,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      guestToken: canManage ? ((row.guest_token as string | null) ?? null) : null,
      guestContact: canManage ? ((row.guest_contact as string | null) ?? null) : null,
      status: row.status as Invite['status'],
    };
  });
  const giveSpaceNotice = Boolean(giveSpaceResult.data?.warned);

  const allDecidedWinners: Record<string, string> = {};
  for (const row of winnerResult.data ?? []) {
    allDecidedWinners[row.poll_id] = row.label;
  }
  const options = (optionResult.data ?? []) as PollOption[];
  const results = (pollResultRows.data ?? []) as OptionResult[];
  const myVotes = Object.fromEntries(
    (voteResult.data ?? []).map((vote) => [vote.option_id, vote.weight as Weight]),
  );

  const announcements: AnnouncementView[] = (announcementResult.data ?? []).map((row) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    return {
      id: row.id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      author_name: author?.display_name ?? 'Host',
    };
  });
  const threadTotal = commentResult.count ?? 0;
  const threadGateInfo = threadGate(threadTotal, canAccessThread);
  // What a reply quotes. Resolved from the rows already loaded: a full thread
  // has every parent, and the preview slice may not — in which case the reply
  // still says who it answered, just without the words.
  const commentRows = commentResult.data ?? [];
  const quoteById = new Map(
    commentRows.map((row) => {
      const author = Array.isArray(row.author) ? row.author[0] : row.author;
      return [
        row.id as string,
        {
          author_name: author?.display_name ?? 'Guest',
          excerpt: threadExcerpt(
            (row.body as string | null) ?? null,
            Boolean(row.voice_url),
          ),
        },
      ];
    }),
  );
  const threadComments = await Promise.all(
    commentRows.map(async (row): Promise<ThreadCommentView> => {
      const author = Array.isArray(row.author) ? row.author[0] : row.author;
      const replyToId = (row.reply_to_id as string | null) ?? null;
      return {
        id: row.id as string,
        body: (row.body as string | null) ?? null,
        voice_url: await signMediaRef((row.voice_url as string | null) ?? null),
        voice_duration_seconds: (row.voice_duration_seconds as number | null) ?? null,
        created_at: row.created_at as string,
        author_id: row.author_id as string,
        author_name: author?.display_name ?? 'Guest',
        reply_to: replyToId
          ? (quoteById.get(replyToId) ?? { author_name: 'an earlier message', excerpt: null })
          : null,
      };
    }),
  );

  // By invitation, never by display name: two guests called Sam are two cards.
  const answersByGuest = groupAnswersByInvite(answerResult.data ?? [], questions);

  const hostCard =
    !isHost && hostProfile && relationship && mutuals
      ? { host: hostProfile, relationship, mutuals }
      : null;
  const calendarEvent = event.starts_at
    ? {
        title: event.title,
        description: event.description,
        location: event.location_name,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
      }
    : null;
  const guestLinks = canManage
    ? hostInvites
        .filter(
          (invite): invite is EventPageInvite & { guest_token: string } =>
            !invite.invitee_id && Boolean(invite.guest_token) && invite.status === 'sent',
        )
        .map((invite) => {
          const rawName = invite.guest_name?.trim() ?? '';
          const contact = invite.guest_contact?.trim() || null;
          const nameIsContact =
            !rawName || rawName === contact || looksLikeContactString(rawName);
          return {
            name: nameIsContact ? 'Guest' : rawName,
            contact,
            url: guestRsvpUrl(invite.guest_token),
          };
        })
    : [];

  const planWhen = formatDateTimeRange(event.starts_at, event.ends_at, eventZone);
  const hostName = canManage ? (hostProfile?.display_name ?? null) : null;
  // While the date is still being polled nobody has been sent anything, so a
  // queued row is not "waiting in line" (CascadeProgress says the same).
  const statusLabelFor = (status: string) =>
    event.status === 'deciding' && normalizeInviteStatus(status) === 'queued'
      ? 'Not invited yet - goes out when the group decides'
      : INVITE_STATUS_LABEL[normalizeInviteStatus(status)];
  const inviteePerson = (input: EventPageAttendee): InviteePerson => {
    const isGuest = !input.inviteeId;
    if (!canManage) {
      return {
        id: input.inviteId,
        name: input.name,
        handle: input.handle,
        avatarUrl: input.avatarUrl,
        seed: input.inviteeId ?? input.inviteId,
        isGuest,
        statusLabel: statusLabelFor(input.status),
        contact: null,
        inviteUrl: null,
        messages: null,
      };
    }

    const personalUrl =
      isGuest && input.guestToken && input.status === 'sent'
        ? guestRsvpUrl(input.guestToken)
        : null;
    const inviteUrl =
      personalUrl ??
      (hostCanShare(shareState) ? eventShareUrl(event.share_token) : null);
    return {
      id: input.inviteId,
      name: input.name,
      handle: input.handle,
      avatarUrl: input.avatarUrl,
      seed: input.inviteeId ?? input.inviteId,
      isGuest,
      statusLabel: statusLabelFor(input.status),
      contact: input.guestContact?.trim() || null,
      inviteUrl,
      messages: {
        plan: planInviteMessage({
          eventTitle: event.title,
          when: planWhen,
          where: event.location_name,
          hostName,
          inviteUrl,
        }),
        app: appInviteMessage({
          appUrl: appOrigin(),
          eventTitle: event.title,
          inviteUrl,
        }),
      },
    };
  };
  const inviteeCards = Object.fromEntries(
    hostInvites.map((invite) => [
      invite.id,
      inviteePerson({
        id: invite.invitee_id ?? invite.id,
        inviteId: invite.id,
        inviteeId: invite.invitee_id,
        name: invite.invitee_name,
        handle: invite.invitee_handle,
        avatarUrl: invite.invitee_avatar_url,
        guestToken: invite.guest_token,
        guestContact: invite.guest_contact,
        status: invite.status,
      }),
    ]),
  );
  const attendeeCards = attendees.map(inviteePerson);

  return {
    event,
    eventZone,
    shareState,
    isHost,
    canManage,
    cohosts,
    cohostCandidates: isHost
      ? cohostCandidates({
          invites: hostInvites,
          connections: addableConnections,
          cohostIds,
          hostId: user.id,
        })
      : [],
    hostCard,
    hostInvites,
    pendingParentalApprovals,
    myInvite,
    guardianStep,
    inviteList: inviteListPeople((inviteListResult.data ?? []) as InviteListRow[]),
    addableConnections,
    attendees,
    giveSpaceNotice,
    poll,
    decidedPolls,
    pendingPolls,
    invitationsReady: readyToSendInvitations(allPolls),
    availability,
    calendarBusy,
    calendarStatus,
    allDecidedWinners,
    options,
    results,
    myVotes,
    venuePerk: venueResult.data,
    questions,
    announcements,
    canAccessThread,
    threadTotal,
    threadGateInfo,
    threadComments,
    acceptedCount:
      canManage || event.show_accepted
        ? attendees.length
        : (hiddenAcceptedCountResult.count ?? 0),
    answersByGuest,
    calendarEvent,
    guestLinks,
    inviteeCards,
    attendeeCards,
    cancelVoiceUrl,
  };
}

/** The few words of a comment a reply quotes above itself. */
export function threadExcerpt(body: string | null, hasVoice: boolean): string | null {
  const text = body?.replace(/\s+/g, ' ').trim() ?? '';
  if (text) return text.length > 90 ? `${text.slice(0, 89)}…` : text;
  return hasVoice ? '🎤 Voice note' : null;
}
