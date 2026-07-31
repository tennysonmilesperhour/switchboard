import type { Metadata } from 'next';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { serializeJsonLd } from '@/lib/security';
import { signMediaRef } from '@/lib/server/media';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { themeColor } from '@/lib/themes';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { CascadeProgress } from '@/components/events/CascadeProgress';
import { AttendeeGrid } from '@/components/events/AttendeeGrid';
import type { InviteePerson } from '@/components/events/InviteeSheet';
import { HostCard, type HostCardData } from '@/components/events/HostCard';
import { JoinRequests } from '@/components/events/JoinRequests';
import { RsvpCard } from '@/components/events/RsvpCard';
import { Announcements, type AnnouncementView } from '@/components/events/Announcements';
import { EventThread, type ThreadCommentView } from '@/components/events/EventThread';
import { VoiceNote } from '@/components/ui/VoiceNote';
import { RunItBackButton } from '@/components/events/RunItBackButton';
import { ScheduleNextButton } from '@/components/events/ScheduleNextButton';
import { PollSection, type OptionResult } from '@/components/polls/PollSection';
import { recurrenceLabel } from '@/lib/engine/recurrence';
import { HostControls } from './HostControls';
import { CoHostManager } from './CoHostManager';
import { AddInvitees } from './AddInvitees';
import { InviteLink } from './InviteLink';
import { getRelationship, getMutualConnections } from '@/lib/server/relationship';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { threadGate, THREAD_PREVIEW_COUNT } from '@/lib/engine/thread';
import { formatDateTime, formatDateTimeRange } from '@/lib/format';
import { resolveEventZone } from '@/lib/server/event-zone';
import { googleCalendarUrl } from '@/lib/calendar-links';
import { appOrigin, eventShareUrl, guestRsvpUrl } from '@/lib/links';
import { hostCanShare, shareLinkState } from '@/lib/share-link';
import { INVITE_STATUS_LABEL } from '@/lib/invite-status';
import {
  appInviteMessage,
  looksLikeContactString,
  planInviteMessage,
} from '@/lib/invitee-contact';
import type {
  EventQuestion,
  Invite,
  Poll,
  PollOption,
  SwitchboardEvent,
} from '@/lib/types';
import type { Weight } from '@/lib/engine/scoring';

/** Rich unfurl card for directly-shared event links (iMessage/WhatsApp/Slack). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  if (!hasAdminCredentials()) return {};
  const { id } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('title, description, starts_at, location_name, time_zone, host_id')
    .eq('id', id)
    .maybeSingle();
  if (!event) return {};
  const zone = await resolveEventZone(admin, event);
  const when = event.starts_at ? formatDateTime(event.starts_at, zone) : null;
  const description =
    event.description?.trim() ||
    [when, event.location_name].filter(Boolean).join(' · ') ||
    'A plan on Switchboard.';
  return {
    title: event.title,
    openGraph: {
      title: event.title,
      description,
      images: [`/api/og/event/${id}`],
    },
  };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ delivery?: string }>;
}) {
  const { id } = await params;
  const { delivery: deliveryNotice } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Preserve where they were headed so signing in returns them to this plan
  // instead of dropping them on the home page. A visitor who turns out not to
  // be on the plan is routed onward to the public join page below.
  if (!user) redirect(`/login?next=${encodeURIComponent(`/events/${id}`)}`);

  // Lazy cascade tick — the cron sweep is the backstop. Run it *after* the
  // response so a plain page view never blocks on write-side work or outbound
  // SMS (SB-07); the tick's effects show on the next load.
  after(async () => {
    try {
      await advanceEventCascade(id);
    } catch {
      // Advancement is best-effort.
    }
  });

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single<SwitchboardEvent>();
  // A signed-in visitor who isn't the host or an invitee can't read this event
  // row through RLS, so `event` is null here both for a plan that doesn't exist
  // and for a real plan they just haven't been let into (e.g. someone who
  // opened a shared link). Send them to the public join page rather than a dead
  // "Nothing here": it shows the shareable plan with an ask-to-join button when
  // the host has turned the invite link on, redirects them straight back here if
  // they actually can see it, and shows a clear "isn't active" note otherwise.
  if (!event) redirect(`/join/${id}`);

  const isHost = event.host_id === user.id;
  const admin = createAdminClient();

  // What this plan's public link actually does right now, from the same module
  // /i/<token> uses to decide what a recipient sees. Both share affordances
  // below hang off this: the app must not offer a host a way to send a link its
  // own recipient page would reject (see @/lib/share-link).
  const shareState = shareLinkState(event);

  // Render the plan's time in its own zone (host-profile fallback for plans
  // created before the zone was captured), so this page agrees with the link
  // unfurl and guest invite pages instead of drifting to the server's UTC.
  const eventZone = await resolveEventZone(admin, event);

  // Co-hosts share host powers. Read the list with admin — a co-host can't
  // see the full roster through their own RLS.
  const { data: cohostRows } = await admin
    .from('event_cohosts')
    .select('cohost_id')
    .eq('event_id', id);
  const cohostIds = (cohostRows ?? []).map((row) => row.cohost_id as string);
  const isCoHost = cohostIds.includes(user.id);
  const canManage = isHost || isCoHost;

  // Names for the primary host's co-host manager.
  let cohosts: Array<{ id: string; name: string }> = [];
  if (isHost && cohostIds.length > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', cohostIds);
    cohosts = (data ?? []).map((p) => ({
      id: p.id as string,
      name: (p.display_name as string) ?? 'Co-host',
    }));
  }

  // "Hosted by" identity for anyone who isn't the host: the host's public
  // profile, how the viewer is already connected, and any mutual friends. The
  // host doesn't need to be told they're hosting their own plan.
  let hostCard: {
    host: HostCardData;
    relationship: Awaited<ReturnType<typeof getRelationship>>;
    mutuals: Awaited<ReturnType<typeof getMutualConnections>>;
  } | null = null;
  if (!isHost) {
    const { data: hostProfile } = await supabase
      .from('profiles')
      .select('id, display_name, handle, avatar_url, tagline')
      .eq('id', event.host_id)
      .maybeSingle<HostCardData>();
    if (hostProfile) {
      const [relationship, mutuals] = await Promise.all([
        getRelationship(supabase, user.id, event.host_id),
        getMutualConnections(admin, user.id, event.host_id),
      ]);
      hostCard = { host: hostProfile, relationship, mutuals };
    }
  }

  // Host/co-host: full cascade view. Invitee: their own invite.
  let hostInvites: Array<
    Invite & {
      invitee_name: string;
      invitee_handle: string | null;
      invitee_avatar_url: string | null;
      deliveries?: Array<{
        channel: 'in_app' | 'email' | 'sms';
        status: 'sent' | 'not_configured' | 'invalid_recipient' | 'failed';
      }>;
    }
  > = [];
  let myInvite: Invite | null = null;

  if (canManage) {
    const { data } = await admin
      .from('invites')
      .select('*, invitee:profiles(display_name, handle, avatar_url)')
      .eq('event_id', id)
      .order('position');
    hostInvites = (data ?? []).map((row) => {
      const profile = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;
      return {
        ...(row as Invite),
        invitee_name: profile?.display_name ?? row.guest_name ?? 'Guest',
        invitee_handle: (profile?.handle as string | null) ?? null,
        invitee_avatar_url: (profile?.avatar_url as string | null) ?? null,
      };
    });

    const inviteIds = hostInvites.map((invite) => invite.id);
    if (inviteIds.length > 0) {
      const { data: attempts } = await admin
        .from('invite_delivery_attempts')
        .select('invite_id, channel, status, attempted_at')
        .in('invite_id', inviteIds)
        .order('attempted_at', { ascending: false });
      const latestByChannel = new Map<
        string,
        {
          channel: 'in_app' | 'email' | 'sms';
          status: 'sent' | 'not_configured' | 'invalid_recipient' | 'failed';
        }
      >();
      for (const attempt of attempts ?? []) {
        const key = `${attempt.invite_id}:${attempt.channel}`;
        if (latestByChannel.has(key)) continue;
        latestByChannel.set(key, {
          channel: attempt.channel as 'in_app' | 'email' | 'sms',
          status: attempt.status as
            | 'sent'
            | 'not_configured'
            | 'invalid_recipient'
            | 'failed',
        });
      }
      hostInvites = hostInvites.map((invite) => ({
        ...invite,
        deliveries: [...latestByChannel.entries()]
          .filter(([key]) => key.startsWith(`${invite.id}:`))
          .map(([, attempt]) => attempt),
      }));
    }
  } else {
    const { data } = await supabase
      .from('invites')
      .select('*')
      .eq('event_id', id)
      .eq('invitee_id', user.id)
      .maybeSingle<Invite>();
    myInvite = data;
  }

  // Host's own connections, for one-tap adding to the flow (only needed while
  // the Add-people panel is shown). Anyone already on the invite list is
  // filtered out so the picker only offers new people.
  const addableConnections: Array<{
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
  }> = [];
  if (canManage && event.status === 'inviting') {
    const invitedIds = new Set(
      hostInvites
        .map((invite) => invite.invitee_id)
        .filter((invId): invId is string => Boolean(invId)),
    );
    const { data: connectionRows } = await supabase
      .from('connections')
      .select(
        'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle, avatar_url), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle, avatar_url)',
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    for (const row of connectionRows ?? []) {
      const isRequester = row.requester_id === user.id;
      const otherRaw = isRequester ? row.addressee : row.requester;
      const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
      if (!other || invitedIds.has(other.id)) continue;
      addableConnections.push({
        id: other.id,
        name: other.display_name ?? 'Friend',
        handle: other.handle ?? '',
        avatarUrl: other.avatar_url ?? null,
      });
    }
  }

  // Accepted attendees (respects visibility settings; admin read + TS check).
  // `id` is the profile id where there is one — the "give space" check below
  // compares it against profile ids — with the invite id standing in for a
  // guest who has no account. `inviteId` is what the contact card is keyed on.
  let attendees: Array<{
    id: string;
    inviteId: string;
    inviteeId: string | null;
    name: string;
    handle: string | null;
    avatarUrl: string | null;
    guestToken: string | null;
    guestContact: string | null;
    status: Invite['status'];
  }> = [];
  if (canManage || event.show_accepted) {
    const { data } = await admin
      .from('invites')
      .select(
        'id, invitee_id, guest_name, guest_contact, guest_token, status, invitee:profiles(display_name, handle, avatar_url)',
      )
      .eq('event_id', id)
      .eq('status', 'accepted');
    attendees = (data ?? []).map((row) => {
      const profile = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;
      return {
        id: row.invitee_id ?? row.id,
        inviteId: row.id as string,
        inviteeId: (row.invitee_id as string | null) ?? null,
        name: profile?.display_name ?? row.guest_name ?? 'Guest',
        handle: (profile?.handle as string | null) ?? null,
        avatarUrl: (profile?.avatar_url as string | null) ?? null,
        guestToken: (row.guest_token as string | null) ?? null,
        guestContact: (row.guest_contact as string | null) ?? null,
        status: row.status as Invite['status'],
      };
    });
  }

  // Private "give space" heads-up. Only computed against attendees the viewer
  // can already see, so it never becomes an "is X going?" oracle for hidden
  // guest lists — and it names only people the viewer themselves flagged.
  let avoidedGoing: string[] = [];
  if (attendees.length > 0) {
    const { data: avoids } = await supabase
      .from('profile_avoids')
      .select('avoided_id')
      .eq('avoider_id', user.id);
    const avoidedSet = new Set((avoids ?? []).map((row) => row.avoided_id as string));
    avoidedGoing = attendees
      .filter((attendee) => avoidedSet.has(attendee.id))
      .map((attendee) => attendee.name);
  }

  // Poll (Anonymous Weighted Input)
  const { data: poll } = await supabase
    .from('polls')
    .select('*')
    .eq('event_id', id)
    .maybeSingle<Poll>();

  let options: PollOption[] = [];
  let results: OptionResult[] = [];
  let myVotes: Record<string, Weight> = {};
  if (poll) {
    const [{ data: optionRows }, { data: resultRows }, { data: voteRows }] =
      await Promise.all([
        supabase.from('poll_options').select('*').eq('poll_id', poll.id),
        supabase.rpc('poll_results', { p_poll: poll.id }),
        supabase
          .from('poll_votes')
          .select('option_id, weight')
          .eq('poll_id', poll.id)
          .eq('voter_id', user.id),
      ]);
    options = optionRows ?? [];
    results = (resultRows ?? []) as OptionResult[];
    myVotes = Object.fromEntries(
      (voteRows ?? []).map((v) => [v.option_id, v.weight as Weight]),
    );
  }

  // Venue perk when the location matches a claimed partner venue.
  let venuePerk: { name: string; perk: string } | null = null;
  if (event.location_name) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name, perk')
      .eq('status', 'verified')
      .ilike('name', event.location_name.trim())
      .limit(1)
      .maybeSingle();
    venuePerk = venue ?? null;
  }

  // RSVP questions (host-defined intake).
  const { data: questionRows } = await supabase
    .from('event_questions')
    .select('*')
    .eq('event_id', id)
    .order('position')
    .returns<EventQuestion[]>();
  const questions = questionRows ?? [];

  // Announcements (host broadcasts) with author names.
  const { data: announcementRows } = await supabase
    .from('announcements')
    .select('id, body, created_at, author:profiles(display_name)')
    .eq('event_id', id)
    .order('created_at', { ascending: false });
  const announcements: AnnouncementView[] = (announcementRows ?? []).map((row) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    return {
      id: row.id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      author_name: author?.display_name ?? 'Host',
    };
  });

  // Event thread (RSVP-gated commentary). Full access — read all + post — for
  // hosts/co-hosts and accepted invitees; everyone else who can see the event
  // gets only the opening messages, which blur out below. We read with the
  // admin client and slice server-side so a locked viewer is never sent the
  // gated bodies (the RLS SELECT policy refuses them either way).
  const canAccessThread = canManage || myInvite?.status === 'accepted';
  const { count: threadTotal } = await admin
    .from('event_comments')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id);
  const threadGateInfo = threadGate(threadTotal ?? 0, canAccessThread);

  let threadComments: ThreadCommentView[] = [];
  if (threadGateInfo.visibleCount > 0) {
    let commentsQuery = admin
      .from('event_comments')
      .select(
        'id, body, voice_url, voice_duration_seconds, created_at, author_id, author:profiles(display_name)',
      )
      .eq('event_id', id)
      .order('created_at', { ascending: true });
    if (!canAccessThread) commentsQuery = commentsQuery.limit(THREAD_PREVIEW_COUNT);
    const { data: commentRows } = await commentsQuery;
    threadComments = await Promise.all(
      (commentRows ?? []).map(async (row) => {
        const author = Array.isArray(row.author) ? row.author[0] : row.author;
        return {
          id: row.id as string,
          body: (row.body as string | null) ?? null,
          // voice_url is a private-bucket path; mint a short-lived signed URL
          // for this authorized viewer (they already passed the thread gate).
          voice_url: await signMediaRef((row.voice_url as string | null) ?? null),
          voice_duration_seconds: (row.voice_duration_seconds as number | null) ?? null,
          created_at: row.created_at as string,
          author_id: row.author_id as string,
          author_name: author?.display_name ?? 'Guest',
        };
      }),
    );
  }

  // True accepted count (independent of visibility) so the host knows the reach.
  const { count: acceptedCount } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('status', 'accepted');

  // Host-only: answers to RSVP questions, grouped by attendee.
  let answersByGuest: Array<{ name: string; answers: Array<{ prompt: string; answer: string }> }> = [];
  if (isHost && questions.length > 0) {
    const promptById = new Map(questions.map((q) => [q.id, q.prompt]));
    const { data: answerRows } = await admin
      .from('invite_answers')
      .select('question_id, answer, invite:invites(guest_name, invitee:profiles(display_name))')
      .in('question_id', Array.from(promptById.keys()));
    const grouped = new Map<string, Array<{ prompt: string; answer: string }>>();
    for (const row of answerRows ?? []) {
      const invite = Array.isArray(row.invite) ? row.invite[0] : row.invite;
      const profile = invite
        ? Array.isArray(invite.invitee)
          ? invite.invitee[0]
          : invite.invitee
        : null;
      const name = profile?.display_name ?? invite?.guest_name ?? 'Guest';
      const list = grouped.get(name) ?? [];
      list.push({
        prompt: promptById.get(row.question_id as string) ?? '',
        answer: row.answer as string,
      });
      grouped.set(name, list);
    }
    answersByGuest = Array.from(grouped.entries()).map(([name, answers]) => ({
      name,
      answers,
    }));
  }

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
          (i): i is typeof i & { guest_token: string } =>
            !i.invitee_id && Boolean(i.guest_token) && i.status === 'sent',
        )
        .map((i) => {
          // When someone is invited by email or phone, guest_name is the raw
          // contact string. Don't leak that into the name slot — show a
          // friendly label and surface the contact on its own line.
          const rawName = i.guest_name?.trim() ?? '';
          const contact = i.guest_contact?.trim() || null;
          const nameIsContact =
            !rawName || rawName === contact || looksLikeContactString(rawName);
          return {
            name: nameIsContact ? 'Guest' : rawName,
            contact,
            // Build from the one canonical origin helper (same one the email/SMS
            // send paths use) so a copied guest link can never be stamped with
            // an ephemeral preview deployment origin or a bare relative path.
            url: guestRsvpUrl(i.guest_token),
          };
        })
    : [];

  // ————————————————————— contact cards —————————————————————
  // Tapping anyone on this plan opens their card, and for a host or co-host
  // that card carries the way to reach them. The only contact detail this page
  // will hand to the browser is `invites.guest_contact` — the email or phone
  // the host themselves typed when they added that person, which is also what
  // the cascade already texts and emails. An account holder's own
  // `contact_email`/`contact_phone` are deliberately not here: they are
  // withheld from the API by column grant (see
  // `20260710120000_lock_sensitive_profile_columns.sql`), and `contact_public`
  // promises them to a QR card someone chooses to scan, not to every host of
  // every plan they were invited to.
  //
  // Anyone who isn't managing the plan (an invitee reading "Who's in" on a plan
  // with `show_accepted`) gets identity fields only. That check lives in
  // `inviteePerson` rather than at each render site, because these objects
  // become props of a client component and therefore ship to the browser
  // whether or not the UI draws them.
  let hostName: string | null = null;
  if (canManage) {
    const { data } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', event.host_id)
      .maybeSingle<{ display_name: string | null }>();
    hostName = data?.display_name ?? null;
  }
  const planWhen = formatDateTimeRange(event.starts_at, event.ends_at, eventZone);
  // Narrowed once, outside the closure below: TypeScript drops the `!event`
  // redirect's narrowing at a function boundary.
  const plan = event;

  function inviteePerson(input: {
    inviteId: string;
    inviteeId: string | null;
    name: string;
    handle: string | null;
    avatarUrl: string | null;
    guestToken: string | null;
    guestContact: string | null;
    status: Invite['status'];
  }): InviteePerson {
    const isGuest = !input.inviteeId;
    if (!canManage) {
      // Identity only. Built first so a viewer who will never be shown a link
      // doesn't go anywhere near `appOrigin()`, which throws in production on a
      // misconfigured origin — that alarm belongs to the people sending links.
      return {
        id: input.inviteId,
        name: input.name,
        handle: input.handle,
        avatarUrl: input.avatarUrl,
        seed: input.inviteeId ?? input.inviteId,
        isGuest,
        statusLabel: INVITE_STATUS_LABEL[input.status],
        contact: null,
        inviteUrl: null,
        messages: null,
      };
    }

    // Which link this person gets sent.
    //
    // Their own `/rsvp/<guest_token>` while it is theirs to answer — the same
    // rule the Guest links section below uses, including why it is *not*
    // offered once an invite belongs to an account: holding that token is the
    // authorization to answer the invite (`respond_to_guest_invite`), so it
    // isn't something to pass around on behalf of someone who has their own
    // way in. Otherwise the plan's public link, and only when share-link.ts
    // says the host may hand it out at all — the app must never offer a way to
    // send a link its own recipient page would reject.
    const personalUrl =
      isGuest && input.guestToken && input.status === 'sent'
        ? guestRsvpUrl(input.guestToken)
        : null;
    const inviteUrl =
      personalUrl ??
      (hostCanShare(shareState) ? eventShareUrl(plan.share_token) : null);

    return {
      id: input.inviteId,
      name: input.name,
      handle: input.handle,
      avatarUrl: input.avatarUrl,
      // Match the seed the list rows use, so a face doesn't change colour
      // between the row and the card it opens.
      seed: input.inviteeId ?? input.inviteId,
      isGuest,
      statusLabel: INVITE_STATUS_LABEL[input.status],
      contact: input.guestContact?.trim() || null,
      inviteUrl,
      messages: {
        plan: planInviteMessage({
          eventTitle: plan.title,
          when: planWhen,
          where: plan.location_name,
          hostName,
          inviteUrl,
        }),
        app: appInviteMessage({
          appUrl: appOrigin(),
          eventTitle: plan.title,
          inviteUrl,
        }),
      },
    };
  }

  const inviteeCards: Record<string, InviteePerson> = Object.fromEntries(
    hostInvites.map((invite) => [
      invite.id,
      inviteePerson({
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

  const attendeeCards: InviteePerson[] = attendees.map((attendee) =>
    inviteePerson({
      inviteId: attendee.inviteId,
      inviteeId: attendee.inviteeId,
      name: attendee.name,
      handle: attendee.handle,
      avatarUrl: attendee.avatarUrl,
      guestToken: attendee.guestToken,
      guestContact: attendee.guestContact,
      status: attendee.status,
    }),
  );

  const statusLabel: Record<SwitchboardEvent['status'], string> = {
    draft: 'Draft',
    deciding: '🗳️ Group is deciding',
    inviting: '🪜 Invitations in motion',
    confirmed: '✓ Confirmed',
    cancelled: 'Cancelled',
    past: 'Past',
  };

  // Stable hero color derived from the event id.
  const heroIndex = Array.from(event.id).reduce(
    (sum, ch) => sum + ch.charCodeAt(0),
    0,
  );

  // schema.org/Event JSON-LD so the link is machine-parseable (rich results,
  // and other tools can read the plan).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.starts_at ? { startDate: event.starts_at } : {}),
    ...(event.ends_at ? { endDate: event.ends_at } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.location_name
      ? {
          location: {
            '@type': 'Place',
            name: event.location_name,
            ...(event.location_address ? { address: event.location_address } : {}),
          },
        }
      : {}),
  };

  // cancel_voice_url is a private-bucket path; sign it for this viewer.
  const cancelVoiceUrl = await signMediaRef(event.cancel_voice_url);

  return (
    <AppShell title={event.title} back="/plans">
      <script
        type="application/ld+json"
        // serializeJsonLd (not raw JSON.stringify) so a user-controlled event
        // title/description containing `</script>` cannot break out of this tag.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="space-y-6">
        {canManage && deliveryNotice === 'attention' && (
          <div role="status" className="rounded-card border border-gold bg-gold-soft px-4 py-3">
            <p className="text-sm font-bold text-ink">Your plan was created.</p>
            <p className="mt-1 text-sm text-ink-soft">
              At least one invitation could not be sent automatically. The delivery status below
              shows what needs attention, and guest links remain available to share manually.
            </p>
          </div>
        )}
        {avoidedGoing.length > 0 && (
          <div className="rounded-card bg-gold-soft px-4 py-3">
            <p className="text-sm text-ink">
              <span aria-hidden className="mr-1">👀</span>
              <span className="font-bold">Heads up:</span>{' '}
              {avoidedGoing.length === 1
                ? `${avoidedGoing[0]} is going, and you’ve asked for space from them.`
                : `${avoidedGoing.slice(0, -1).join(', ')} and ${
                    avoidedGoing[avoidedGoing.length - 1]
                  } are going, and you’ve asked for space from them.`}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Only you can see this - totally your call whether to go.
            </p>
          </div>
        )}
        <div className="space-y-4">
          {event.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_url}
              alt=""
              className="w-full max-h-64 rounded-card object-cover shadow-lift"
            />
          )}
          <PlanCard
            variant="full"
            title={event.title}
            color={themeColor(event.theme) ?? planColor(heroIndex)}
            status={statusLabel[event.status]}
            when={formatDateTimeRange(event.starts_at, event.ends_at, eventZone)}
            where={event.location_name ?? undefined}
            attendees={attendees.map((attendee) => ({
              name: attendee.name,
              src: attendee.avatarUrl,
            }))}
            attendeesLabel={
              attendees.length > 0
                ? `${attendees.length}${event.capacity ? ` of ${event.capacity}` : ''} going`
                : undefined
            }
          />
          {event.description && (
            <p className="text-ink-soft text-[15px] leading-relaxed">{event.description}</p>
          )}
          {event.status === 'cancelled' && (event.cancel_reason || event.cancel_voice_url) && (
            <Card tone="terracotta">
              <p className="text-xs font-bold uppercase tracking-wide text-terracotta-deep">
                Why it was called off
              </p>
              {event.cancel_reason && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {event.cancel_reason}
                </p>
              )}
              {cancelVoiceUrl && (
                <div className="mt-2.5">
                  <VoiceNote url={cancelVoiceUrl} tone="soft" />
                </div>
              )}
            </Card>
          )}
          {event.status === 'past' && event.happened_at && (
            <Card tone="sage" lifted>
              <p className="font-extrabold text-lg text-sage-deep">It happened 🎉</p>
              <p className="text-sm text-ink-soft mt-0.5">
                {attendees.length > 0
                  ? `You got ${attendees.length} ${attendees.length === 1 ? 'person' : 'people'} together. That’s the whole point.`
                  : 'That’s the whole point. Want to do it again?'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <RunItBackButton eventId={event.id} />
                <Link
                  href={`/events/${event.id}/capsule`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
                >
                  📦 Add to the Memory Capsule
                </Link>
              </div>
            </Card>
          )}
          <div className="flex gap-2 flex-wrap">
            {event.recurrence && event.recurrence !== 'none' && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-terracotta-soft px-3.5 py-2 text-xs font-bold text-terracotta-deep">
                🔁 {recurrenceLabel(event.recurrence, event.recurrence_interval_days)}
              </span>
            )}
            <a
              href={`/api/events/${event.id}/ics`}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
            >
              📅 Apple / Outlook
            </a>
            {calendarEvent && (
              <a
                href={googleCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                📅 Google Calendar
              </a>
            )}
            {event.wishlist_url && (
              <a
                href={event.wishlist_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                🎁 Wishlist
              </a>
            )}
            {event.room_id && (
              <Link
                href={`/rooms/${event.room_id}`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                ❋ Living Room
              </Link>
            )}
            {event.starts_at && new Date(event.starts_at) < new Date() && (
              <Link
                href={`/events/${event.id}/capsule`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                📦 Memory Capsule
              </Link>
            )}
            {isHost && (
              <a
                href={`/api/events/${event.id}/guests.csv`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                ⬇ Guest list (CSV)
              </a>
            )}
            {canManage &&
              event.status !== 'cancelled' &&
              event.status !== 'past' && (
                <Link
                  href={`/events/${event.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
                >
                  ✏️ Edit plan
                </Link>
              )}
            {/* Share the plan's PUBLIC link, never /events/<id>: the event URL
                is RLS-gated, so a recipient who isn't already an invitee lands
                on a sign-up wall and then a dead end — exactly how texted
                invitations kept arriving broken.

                Host/co-host only. The link admits whoever holds it, so who may
                hand it out is the host's call, not every invitee's — the same
                boundary as the Invite link card and share_link_active.

                Gated on hostCanShare, not on "always". This button used to be
                unconditional, so a host whose plan was still in a date poll — or
                whose link was switched off — could share a URL that told every
                recipient "this invite link isn't active". The Invite link card
                below stays visible in those states and explains what to do. */}
            {canManage && hostCanShare(shareState) && (
              <ShareButton
                url={eventShareUrl(event.share_token)}
                title={event.title}
                text={`${event.title} on Switchboard`}
              />
            )}
          </div>
          {venuePerk && (
            <p className="rounded-card bg-gold-soft px-3.5 py-3 text-sm">
              🏪 <strong className="font-bold">{venuePerk.name}</strong> perk for Switchboard groups:{' '}
              {venuePerk.perk}
            </p>
          )}
        </div>

        {/* Who's hosting this plan */}
        {hostCard && (
          <HostCard
            host={hostCard.host}
            relationship={hostCard.relationship}
            mutuals={hostCard.mutuals}
          />
        )}

        {/* Invitee RSVP */}
        {myInvite?.status === 'sent' && (
          <div id={`rsvp-${event.id}`} className="scroll-mt-20">
          <RsvpCard
            inviteId={myInvite.id}
            questions={questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              required: q.required,
              kind: q.kind,
              options: q.options,
            }))}
            expiresAtIso={
              inviteExpiresAt({
                id: myInvite.id,
                position: myInvite.position,
                groupStage: myInvite.group_stage,
                status: myInvite.status,
                windowMinutes: myInvite.window_minutes,
                sentAt: myInvite.sent_at,
              })?.toISOString() ?? null
            }
          />
          </div>
        )}
        {myInvite?.status === 'accepted' && (
          <Card tone="sage" lifted>
            <p className="font-extrabold text-lg text-sage-deep">You’re in ✓</p>
            <p className="text-sm text-ink-soft mt-0.5">
              See you there. The Living Room has the details.
            </p>
          </Card>
        )}
        {myInvite?.status === 'waitlisted' && (
          <Card tone="gold" lifted>
            <p className="font-extrabold text-lg">You’re on the waitlist</p>
            <p className="text-sm text-ink-soft mt-0.5">
              If a spot opens up, you’ll be the first to know.
            </p>
          </Card>
        )}

        {/* Poll */}
        {poll && (
          <PollSection
            poll={poll}
            options={options}
            results={results}
            myVotes={myVotes}
            isHost={isHost}
            eventId={event.id}
          />
        )}

        {/* Host broadcasts */}
        <Announcements
          eventId={event.id}
          isHost={isHost}
          canReach={acceptedCount ?? 0}
          announcements={announcements}
        />

        {/* RSVP-gated thread — full for anyone who's in, a blurred preview
            otherwise. Skipped only for a locked viewer with nothing to see
            (empty thread + no access), so it never teases an empty room. */}
        {(canAccessThread || (threadTotal ?? 0) > 0) && (
          <EventThread
            eventId={event.id}
            unlocked={threadGateInfo.unlocked}
            canModerate={canManage}
            currentUserId={user.id}
            comments={threadComments}
            hiddenCount={threadGateInfo.hiddenCount}
            blurRows={threadGateInfo.blurRows}
          />
        )}

        {/* Host-only: RSVP question answers */}
        {isHost && answersByGuest.length > 0 && (
          <section>
            <SectionHeader title="RSVP answers" hint="Only you can see these" />
            <ul className="space-y-2">
              {answersByGuest.map((guest) => (
                <li key={guest.name} className="rounded-card bg-cream px-3.5 py-3">
                  <p className="text-sm font-bold text-ink">{guest.name}</p>
                  <dl className="mt-1.5 space-y-1">
                    {guest.answers.map((qa, i) => (
                      <div key={i} className="text-sm">
                        <dt className="text-ink-faint">{qa.prompt}</dt>
                        <dd className="text-ink font-medium">{qa.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Attendees */}
        {attendees.length > 0 && (
          <section>
            <SectionHeader
              title="Who’s in"
              hint={`${attendees.length}${event.capacity ? ` of ${event.capacity}` : ''} so far`}
            />
            <AttendeeGrid people={attendeeCards} />
          </section>
        )}

        {/* Open Table join requests */}
        {canManage && (
          <JoinRequests
            eventId={event.id}
            requests={hostInvites
              .filter((invite) => invite.status === 'requested')
              .map((invite) => ({
                inviteId: invite.id,
                name: invite.invitee_name,
                userId: invite.invitee_id ?? invite.id,
              }))}
          />
        )}

        {/* Host cascade view */}
        {canManage && hostInvites.length > 0 && event.status !== 'deciding' && (
          <section>
            <SectionHeader
              title="Invitation flow"
              hint="Only you see this - reorder or re-time anyone still in line"
            />
            <CascadeProgress
              invites={hostInvites.filter((invite) => invite.status !== 'requested')}
              mode={event.invite_mode}
              eventId={event.id}
              editable={canManage && event.status === 'inviting'}
              people={inviteeCards}
            />
          </section>
        )}

        {/* Guest links for the host to share */}
        {guestLinks.length > 0 && (
          <section>
            <SectionHeader title="Guest links" hint="For people you invited who aren’t on Switchboard" />
            <p className="text-sm text-ink-soft mb-2.5 leading-relaxed">
              Each link opens a private invitation page for that person - the
              plan shows up with no account or app. Copy it and send it however
              you like (text, email, DM); they sign in once to reply, which is
              also how they end up connected to you.
            </p>
            <ul className="space-y-2">
              {guestLinks.map((guest) => (
                <li key={guest.url} className="flex items-center justify-between gap-2 rounded-card bg-cream px-3.5 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold truncate">{guest.name}</span>
                    {guest.contact && (
                      <span className="block text-xs text-ink-faint truncate">{guest.contact}</span>
                    )}
                  </span>
                  <CopyButton text={guest.url} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Post-creation invite link: one link the host can share to bring more
            people in, on top of the ordered cascade.

            Shown for every state the host can still act on — including a plan
            still in its date poll, and a link the host switched off. Hiding the
            card in those states is what left a host with no way to see that the
            link they had already texted around was dead. The card itself says
            what a recipient sees right now. */}
        {canManage && shareState !== 'past' && shareState !== 'cancelled' && (
          <InviteLink
            eventId={event.id}
            shareUrl={eventShareUrl(event.share_token)}
            state={shareState}
            eventTitle={event.title}
          />
        )}

        {canManage && event.status === 'inviting' && (
          <AddInvitees eventId={event.id} connections={addableConnections} />
        )}

        {canManage && (
          <HostControls
            event={event}
            pollDecided={poll?.phase === 'decided'}
            isPrimaryHost={isHost}
          />
        )}

        {isHost && <CoHostManager eventId={event.id} cohosts={cohosts} />}

        {/* Standing plan: a recurring host always has a one-tap "next one". */}
        {isHost && event.recurrence && event.recurrence !== 'none' && (
          <section className="border-t border-line pt-6">
            <p className="text-sm text-ink-soft mb-2.5">
              This is a standing plan ({recurrenceLabel(event.recurrence, event.recurrence_interval_days)?.toLowerCase()}).
              Ready for the next one with the same crew?
            </p>
            <ScheduleNextButton eventId={event.id} />
          </section>
        )}

        {/* Run it back: a one-off plan the host can re-clone once it's behind them. */}
        {isHost &&
          (!event.recurrence || event.recurrence === 'none') &&
          (event.status === 'past' ||
            event.status === 'cancelled' ||
            (event.starts_at && new Date(event.starts_at) < new Date())) && (
            <section className="border-t border-line pt-6">
              <p className="text-sm text-ink-soft mb-2.5">
                Loved it? Gather the same crew for a fresh plan.
              </p>
              <RunItBackButton eventId={event.id} />
            </section>
          )}
      </div>
    </AppShell>
  );
}
