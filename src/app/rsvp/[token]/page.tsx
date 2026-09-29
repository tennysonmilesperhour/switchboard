import { canSubscribeGuestSms } from '@/lib/sms-commands';
import { normalizePhoneNumber } from '@/lib/phone';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { getUser } from '@/lib/supabase/server';
import { reportOperationalError } from '@/lib/server/observability';
import { safeHttpUrl, serializeJsonLd } from '@/lib/security';
import { inviteOpenGraph, unfurlSummary } from '@/lib/invite-links';
import { errorFor, errorRef } from '@/lib/errors';
import { resolveEventZone } from '@/lib/server/event-zone';
import { shareLinkNotice } from '@/lib/share-link';
import { guardianStepFor } from '@/lib/guardian-approval';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { InvitePlanDetails } from '@/components/events/InvitePlanDetails';
import { RsvpSignInGate } from '@/components/events/RsvpSignInGate';
import { GuestRsvpClient } from './GuestRsvpClient';
import { JoinPrompt } from './JoinPrompt';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  if (!hasAdminCredentials()) return { title: 'You’re invited' };

  const { token } = await params;
  const admin = createAdminClient();
  // Direct lookups rather than a PostgREST-embedded join (see the page
  // component below) so metadata still resolves under FK/schema drift.
  const { data: invite } = await admin
    .from('invites')
    .select('event_id')
    .eq('guest_token', token)
    .maybeSingle();
  const { data: event } = invite
    ? await admin
        .from('events')
        .select('title, description, location_name')
        .eq('id', invite.event_id)
        .maybeSingle()
    : { data: null };
  const title = event?.title ? `You’re invited: ${event.title}` : 'You’re invited';
  return {
    title,
    // Shared with `/i/<share_token>`: Next replaces the layout's whole
    // `openGraph` object here rather than extending it, so a route that lists
    // only a title and an image unfurls without the description, `og:type` and
    // site name every other page keeps. See `inviteOpenGraph`.
    openGraph: inviteOpenGraph({
      title,
      description: event ? unfurlSummary(event) : null,
      image: invite ? `/api/og/event/${invite.event_id}` : null,
    }),
  };
}

/**
 * Public guest invitation — reached via an unguessable token link. Viewing needs
 * no account; answering needs a signed-in one.
 */
export default async function GuestRsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = hasAdminCredentials() ? createAdminClient() : null;

  // Without a service-role key this page can look up *no* invite, so it would
  // tell every guest their invitation "isn't here anymore" — a server
  // misconfiguration masquerading as an expired link. In production, fail
  // loudly (logged + error boundary) instead of quietly misleading guests;
  // locally and in CI, where admin creds are routinely absent, keep the
  // graceful fallback so the not-found copy still renders.
  if (!admin && process.env.NODE_ENV === 'production') {
    await reportOperationalError(
      'rsvp.lookup',
      new Error('Supabase admin credentials are not configured'),
    );
    throw new Error('Guest RSVP is unavailable: server is misconfigured');
  }

  // Fetch the invite, its event, and the host as three direct lookups by id
  // rather than one PostgREST-embedded join. The embedded form
  // (`event:events(..., host:profiles(...))`) depends on the invites→events and
  // events→profiles foreign keys being resolvable in *this* database; a
  // deployment whose DB has FK/schema drift makes that query error, and because
  // the error was previously discarded, every guest link silently rendered
  // "isn't here anymore." Lookups by primary key are immune to that, and we now
  // surface a genuine query error (logged + error boundary) instead of
  // swallowing it into a fake not-found. A truly missing token still returns a
  // null row with no error, so the friendly not-found copy still shows.
  const { data: invite, error: inviteError } = admin
    ? await admin
        .from('invites')
        .select('id, event_id, status, guest_name, invitee_id')
        .eq('guest_token', token)
        .maybeSingle()
    : { data: null, error: null };
  if (inviteError) {
    await reportOperationalError('rsvp.invite-lookup', inviteError, {});
    throw new Error('Guest RSVP lookup failed');
  }

  const { data: event, error: eventError } = invite && admin
    ? await admin
        .from('events')
        .select('status, title, description, location_name, location_address, starts_at, ends_at, time_zone, host_id, cover_url, wishlist_url, parental_approval')
        .eq('id', invite.event_id)
        .maybeSingle()
    : { data: null, error: null };
  if (eventError) {
    await reportOperationalError('rsvp.event-lookup', eventError, {});
    throw new Error('Guest RSVP lookup failed');
  }

  const { data: host } = event && admin
    ? await admin
        .from('profiles')
        .select('display_name')
        .eq('id', event.host_id)
        .maybeSingle()
    : { data: null };

  // Host-defined RSVP questions, if any.
  const { data: questionRows } = invite && admin
    ? await admin
        .from('event_questions')
        .select('id, prompt, required, kind, options')
        .eq('event_id', invite.event_id)
        .order('position')
    : { data: null };
  const questions = (questionRows ?? []).map((q) => ({
    id: q.id,
    prompt: q.prompt,
    required: q.required,
    kind: q.kind === 'choice' ? 'choice' as const : 'text' as const,
    options: q.options,
  }));

  // An invite link is often a guest's first contact with Switchboard, so the
  // plan itself renders for anyone holding the token — no account, no app. The
  // answer is what needs a session: a signed-out visitor gets the sign-in gate
  // where the buttons would be (and, for an invitation that's already been
  // answered or has moved on, the softer join nudge instead).
  // Resolve the viewer defensively: the anon Supabase client throws when its
  // credentials aren't configured (CI and local e2e run the app without them),
  // and a missing session must never break this public page — so treat an
  // unresolved viewer as logged-out.
  const user = await getUser().catch(() => null);
  // A yes held for a guardian (or turned down by one) shows its request on
  // every visit. Only to the person who said yes — the token alone is a
  // forwardable link — and masked even then (see GuardianRequestView).
  const viewerOwnsInvite = Boolean(user && invite?.invitee_id === user.id);
  const { data: guardianRows } =
    admin && invite && event?.parental_approval && viewerOwnsInvite &&
    (invite.status === 'pending_approval' || invite.status === 'declined')
      ? await admin
          .from('parental_approvals')
          .select('status, guardian_email, created_at, email_status')
          .eq('invite_id', invite.id)
          .eq('event_id', invite.event_id)
      : { data: null };
  const guardianRequest = guardianStepFor(invite?.status, guardianRows ?? [])?.request ?? null;
  const smsNumber = normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER);
  const hostName = host?.display_name ?? 'Your host';
  // Show the plan's local time, not the server's UTC. Falls back to the host's
  // profile zone for plans created before the zone was captured on the event.
  const zone = admin ? await resolveEventZone(admin, event) : null;
  const gone = errorFor('SB-RSVP-GONE');
  // A plan that was called off or has already happened. Cancelling leaves
  // accepted invites as they were, so without this an accepted guest opening
  // their link after the host called it off read "You're in! See you there."
  // with add-to-calendar buttons, and an unanswered one was offered a sign-in
  // to answer a plan that can't take answers. Same copy and codes as the share
  // link gives for the same two states.
  const closedNotice =
    event?.status === 'cancelled' || event?.status === 'past'
      ? shareLinkNotice(event.status, host?.display_name)
      : null;

  // schema.org/Event JSON-LD so the guest link unfurls richly and is machine
  // readable, matching the host event page.
  const jsonLd = event
    ? {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: event.title,
        ...(event.description ? { description: event.description } : {}),
        ...(safeHttpUrl(event.cover_url) ? { image: safeHttpUrl(event.cover_url) } : {}),
        ...(event.starts_at ? { startDate: event.starts_at } : {}),
        ...(event.ends_at ? { endDate: event.ends_at } : {}),
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        ...(event.location_name || event.location_address
          ? {
              location: {
                '@type': 'Place',
                ...(event.location_name ? { name: event.location_name } : {}),
                ...(event.location_address ? { address: event.location_address } : {}),
              },
            }
          : {}),
      }
    : null;

  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="py-6">
        <span className="font-extrabold tracking-tight text-xl">
          Switch<span className="text-terracotta-deep">board</span>
        </span>
      </header>
      <main className="flex-1 flex flex-col justify-center pb-24">
        {!invite || !event ? (
          <div className="text-center">
            <p className="text-4xl mb-3" aria-hidden>🍂</p>
            <h1 className="font-extrabold tracking-tight text-2xl">{gone.message}</h1>
            <p className="text-ink-soft text-sm mt-2">{gone.fix}</p>
            {/* Which of "expired", "withdrawn", or "this deployment can't see
                the invite at all" you are looking at is not knowable from the
                sentence. The code is. */}
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {errorRef(gone.code)}
            </p>
          </div>
        ) : (
          <>
            <InvitePlanDetails
              hostName={host?.display_name ?? null}
              title={event.title}
              coverUrl={event.cover_url}
              startsAt={event.starts_at}
              endsAt={event.ends_at}
              timeZone={zone}
              locationName={event.location_name}
              locationAddress={event.location_address}
              description={event.description}
              wishlistUrl={event.wishlist_url}
            />
            {smsNumber && !invite.invitee_id && ['sent', 'accepted'].includes(invite.status) && canSubscribeGuestSms(event.status, event.starts_at) && (
              <section className="my-5 rounded-card border border-line p-4 space-y-2">
                <h2 className="font-bold">Text updates for this invitation</h2>
                <p className="text-sm text-ink-soft">No account needed for updates. Send the prepared JOIN message from your phone to agree to Switchboard texts about this invitation, including time/place changes, cancellations and reminders. This does not RSVP or subscribe you to other plans.</p>
                <a className="inline-block underline font-semibold" href={`sms:${smsNumber}?body=${encodeURIComponent(`JOIN ${token}`)}`}>Subscribe by text</a>
                <p className="text-xs text-ink-soft">Send JOIN {token} to {smsNumber}. Texts wait between 10pm and 8am in the plan’s timezone. Subscription ends with the plan or after 30 days. Message frequency varies. Msg & data rates may apply. Reply STOP to stop all texts or HELP for help. No marketing.</p>
                <p className="text-xs"><a className="underline" href="/sms-compliance">SMS terms</a> · <a className="underline" href="/privacy">Privacy</a></p>
              </section>
            )}
            {jsonLd && (
              <script
                type="application/ld+json"
                // serializeJsonLd (not raw JSON.stringify) so a user-controlled
                // event title/description/location containing `</script>` can't
                // break out of the tag and inject markup on this public page.
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
              />
            )}
            {closedNotice ? (
              <div className="mt-8 rounded-card bg-cream px-4 py-3.5">
                <ErrorNotice
                  message={closedNotice.heading}
                  fix={closedNotice.body}
                  code={closedNotice.code}
                />
                {/* Their own plan page still has the thread and the capsule. */}
                {user && invite.invitee_id === user.id && (
                  <Link
                    href={`/events/${invite.event_id}`}
                    className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
                  >
                    Open the plan
                  </Link>
                )}
              </div>
            ) : !user && invite.status === 'sent' ? (
              // Still answerable, nobody signed in: the gate replaces the
              // buttons and carries them back here once they're in.
              <RsvpSignInGate next={`/rsvp/${token}`} hostName={host?.display_name ?? undefined} />
            ) : (
              <GuestRsvpClient
                token={token}
                guestName={invite.guest_name ?? 'there'}
                initialStatus={invite.status}
                questions={questions}
                authed={Boolean(user)}
                unclaimed={invite.invitee_id === null}
                // Only offer the way through once this invite actually belongs
                // to the viewer — /events/<id> is RLS-gated on exactly that, so
                // linking an unclaimed invite would bounce them to /join. A
                // fresh answer claims the invite and returns the id itself.
                eventId={viewerOwnsInvite ? invite.event_id : null}
                inviteId={invite.id}
                guardianRequest={guardianRequest}
                calendarEvent={
                  event.starts_at
                    ? {
                        title: event.title,
                        description: event.description,
                        location: event.location_name ?? event.location_address,
                        startsAt: event.starts_at,
                        endsAt: event.ends_at,
                      }
                    : null
                }
              />
            )}
            {/* Already answered, or the invitation has moved on: no gate to show,
                so keep the warm nudge for a signed-out reader. */}
            {!user && invite.status !== 'sent' && (
              <JoinPrompt hostName={hostName} next={`/rsvp/${token}`} />
            )}
            {/* This used to promise that "invitations flow one person at a
                time", on every plan. Most plans ask everyone at once (it is the
                wizard's default), and a share link is open to anyone holding
                it, so the line told recipients something untrue about the plan
                in front of them. What holds for every plan is what stays. */}
            <p className="text-xs text-ink-faint mt-10 leading-relaxed">
              Switchboard keeps plans low-pressure: answer when you’re ready,
              and if you can’t make it, that’s a complete answer. No hard
              feelings.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
