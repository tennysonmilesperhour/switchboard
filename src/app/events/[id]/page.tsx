import type { Metadata } from 'next';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { safeHttpUrl, serializeJsonLd } from '@/lib/security';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { themeColor } from '@/lib/themes';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { CascadeProgress } from '@/components/events/CascadeProgress';
import { AttendeeGrid } from '@/components/events/AttendeeGrid';
import { HostCard } from '@/components/events/HostCard';
import { JoinRequests } from '@/components/events/JoinRequests';
import { ParentalApprovalManager } from '@/components/events/ParentalApprovalManager';
import { RsvpCard } from '@/components/events/RsvpCard';
import { Announcements } from '@/components/events/Announcements';
import { EventThread } from '@/components/events/EventThread';
import { VoiceNote } from '@/components/ui/VoiceNote';
import { RunItBackButton } from '@/components/events/RunItBackButton';
import { ScheduleNextButton } from '@/components/events/ScheduleNextButton';
import { PollSection } from '@/components/polls/PollSection';
import { PollChain } from '@/components/polls/PollChain';
import { FollowUpComposer } from '@/components/polls/FollowUpComposer';
import { AvailabilityGrid } from '@/components/events/AvailabilityGrid';
import { recurrenceLabel } from '@/lib/engine/recurrence';
import { HostControls } from './HostControls';
import { CoHostManager } from './CoHostManager';
import { AddInvitees } from './AddInvitees';
import { InviteLink } from './InviteLink';
import { PrivacyAccess } from './PrivacyAccess';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { formatDateTime, formatDateTimeRange } from '@/lib/format';
import { resolveEventZone } from '@/lib/server/event-zone';
import { googleCalendarUrl } from '@/lib/calendar-links';
import { eventShareUrl } from '@/lib/links';
import {
  hostCanEditInvitees,
  hostCanEditLine,
  hostCanShare,
} from '@/lib/share-link';
import { invitationFlowHint } from '@/lib/engine/line-edit';
import type { SwitchboardEvent } from '@/lib/types';
import { normalizePollTopic, pollQuestion } from '@/lib/types';
import { loadEventPage } from '@/lib/server/event-page';

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
  // Preserve where they were headed so signing in returns them to this plan.
  if (!user) redirect(`/login?next=${encodeURIComponent(`/events/${id}`)}`);

  // Cascade advancement is write-side work; never put it back on the page's
  // critical path. The cron sweep remains the backstop.
  after(async () => {
    try {
      await advanceEventCascade(id);
    } catch {
      // Advancement is best-effort.
    }
  });

  const loaded = await loadEventPage(id, user);
  // RLS makes a missing event and an event this viewer cannot read equivalent.
  // The join page can safely resolve the public/share-link branch.
  if (!loaded) redirect(`/join/${id}`);
  const {
    event,
    eventZone,
    shareState,
    isHost,
    canManage,
    cohosts,
    hostCard,
    hostInvites,
    myInvite,
    addableConnections,
    attendees,
    giveSpaceNotice,
    poll,
    decidedPolls,
    pendingPolls,
    availability,
    calendarBusy,
    calendarStatus,
    allDecidedWinners,
    options,
    results,
    myVotes,
    venuePerk,
    questions,
    announcements,
    canAccessThread,
    threadTotal,
    threadGateInfo,
    threadComments,
    acceptedCount,
    answersByGuest,
    calendarEvent,
    guestLinks,
    inviteeCards,
    attendeeCards,
    cancelVoiceUrl,
    pendingParentalApprovals,
  } = loaded;

  // What the host may still change about the invitation line. Wider than
  // editing the guest list: while a date poll runs nothing has gone out, so the
  // order is still a draft and the database already accepts the edit.
  const lineEditable = canManage && hostCanEditLine(event.status);

  const statusLabel: Record<SwitchboardEvent['status'], string> = {
    draft: 'Draft',
    deciding: '🗳️ Group is deciding',
    inviting: '🪜 Invitations in motion',
    confirmed: '✓ Confirmed',
    cancelled: 'Cancelled',
    past: 'Past',
  };

  // Host-typed outbound URLs, validated at the sink like every other surface
  // that renders them (InvitePlanDetails, the two invite pages' JSON-LD). Both
  // write paths clean these on save, but a row predating that guard — or one
  // carried forward verbatim by Run It Back — reaches this page unchecked, and
  // this page is the one the plan's own guests open. See docs/SECURITY.md §6.
  const coverUrl = safeHttpUrl(event.cover_url);
  const wishlistUrl = safeHttpUrl(event.wishlist_url);

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
              shows what needs attention, and invite links remain available to share manually.
            </p>
          </div>
        )}
        {/* The Give Space heads-up. Every word of it is load-bearing:
            “Someone” never becomes a name or a number, “may also be” never
            becomes “is”, and the note underneath says plainly that nothing
            more is coming — so the silence afterwards is understood rather
            than read as news. It renders a stored boolean, so it says the same
            thing on every visit no matter what anyone else has done since. */}
        {giveSpaceNotice && (
          <div className="rounded-card bg-gold-soft px-4 py-3">
            <p className="text-sm text-ink">
              <span aria-hidden className="mr-1">👀</span>
              <span className="font-bold">Heads up:</span> someone you’ve chosen to
              give space may also be there.
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Only you can see this. We won’t say who, and we won’t tell you
              anything else about them — including if that changes. It’s
              entirely your call whether to go.
            </p>
          </div>
        )}
        <div className="space-y-4">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
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
            {wishlistUrl && (
              <a
                href={wishlistUrl}
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
                ❋ Room
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
              kind: q.kind === 'choice' ? 'choice' : 'text',
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
              See you there. The room has the details.
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

        {/* When everyone is free. Above the poll on purpose: it is the input to
            choosing a date, and a group that reads it first proposes times
            people can actually make. */}
        {!event.starts_at && (
          <Card>
            <AvailabilityGrid
              eventId={id}
              timeZone={event.time_zone ?? null}
              counts={availability.counts}
              responders={availability.responders}
              eligiblePeople={availability.eligiblePeople}
              isHost={isHost}
              pollId={poll && poll.phase !== 'decided' ? poll.id : null}
              busySlots={calendarBusy}
              calendarUsable={calendarStatus?.usable ?? false}
              coveredThrough={calendarStatus?.coveredThrough ?? null}
            />
          </Card>
        )}

        {/* Poll, plus whatever this plan has already settled and whatever is
            queued behind the current question. */}
        {poll && (
          <>
            <PollChain
              decided={decidedPolls.map((row) => ({
                id: row.id,
                question: pollQuestion(row),
                winner:
                  allDecidedWinners[row.id] ?? null,
              }))}
              pending={pendingPolls.map((row) => ({
                id: row.id,
                question: pollQuestion(row),
              }))}
              activeQuestion={pollQuestion(poll)}
              activeDecided={poll.phase === 'decided'}
              eventId={event.id}
              isHost={canManage}
            />
            <PollSection
              poll={poll}
              options={options}
              results={results}
              myVotes={myVotes}
              isHost={isHost}
              eventId={event.id}
              currentUserId={user.id}
            />
            {canManage && (
              <FollowUpComposer
                parentPollId={poll.id}
                eventId={event.id}
                parentTopic={normalizePollTopic(poll.topic)}
                hasPending={pendingPolls.length > 0}
              />
            )}
          </>
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

        {canManage && pendingParentalApprovals.length > 0 && (
          <ParentalApprovalManager
            eventId={event.id}
            approvals={pendingParentalApprovals}
          />
        )}

        {/* Host cascade view. Shown while the group is still deciding too:
            hiding it there left a host with no list of who they had invited,
            and a creation banner pointing at a delivery status that was not
            on the page. The rows are read-only until invites start moving. */}
        {canManage && hostInvites.length > 0 && (
          <section>
            <SectionHeader
              title={event.status === 'deciding' ? 'Who is invited' : 'Invitation flow'}
              hint={invitationFlowHint(event.invite_mode, {
                editable: lineEditable,
                deciding: event.status === 'deciding',
              })}
            />
            <CascadeProgress
              invites={hostInvites.filter((invite) => invite.status !== 'requested')}
              mode={event.invite_mode}
              eventId={event.id}
              editable={lineEditable}
              people={inviteeCards}
            />
          </section>
        )}

        {/* Guest links for the host to share */}
        {guestLinks.length > 0 && (
          <section>
            <SectionHeader title="Invite links" hint="For people you invited who aren’t on Switchboard" />
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

        {canManage && hostCanEditInvitees(event.status) && (
          <AddInvitees eventId={event.id} connections={addableConnections} />
        )}

        {canManage && (
          <HostControls
            event={event}
            pollDecided={poll?.phase === 'decided'}
            isPrimaryHost={isHost}
          />
        )}

        {canManage && event.status !== 'cancelled' && (
          <PrivacyAccess
            eventId={event.id}
            showInviteList={event.show_invite_list}
            showAccepted={event.show_accepted}
            showExpired={event.show_expired}
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
