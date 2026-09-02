import type { Metadata } from 'next';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { getUser } from '@/lib/supabase/server';
import { reportOperationalError } from '@/lib/server/observability';
import { safeHttpUrl, serializeJsonLd } from '@/lib/security';
import { errorFor, errorRef } from '@/lib/errors';
import { resolveEventZone } from '@/lib/server/event-zone';
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
        .select('title')
        .eq('id', invite.event_id)
        .maybeSingle()
    : { data: null };
  const title = event?.title ? `You’re invited: ${event.title}` : 'You’re invited';
  return {
    title,
    openGraph: {
      title,
      images: invite ? [`/api/og/event/${invite.event_id}`] : [],
    },
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
        .select('title, description, location_name, location_address, starts_at, ends_at, time_zone, host_id, cover_url, wishlist_url')
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
  const hostName = host?.display_name ?? 'Your host';
  // Show the plan's local time, not the server's UTC. Falls back to the host's
  // profile zone for plans created before the zone was captured on the event.
  const zone = admin ? await resolveEventZone(admin, event) : null;
  const gone = errorFor('SB-RSVP-GONE');

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
            {jsonLd && (
              <script
                type="application/ld+json"
                // serializeJsonLd (not raw JSON.stringify) so a user-controlled
                // event title/description/location containing `</script>` can't
                // break out of the tag and inject markup on this public page.
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
              />
            )}
            {!user && invite.status === 'sent' ? (
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
                eventId={user && invite.invitee_id === user.id ? invite.event_id : null}
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
            <p className="text-xs text-ink-faint mt-10 leading-relaxed">
              Switchboard makes plans without pressure - invitations flow one
              person at a time, so nobody feels like a backup. If you can’t
              make it, the invitation quietly moves along. No hard feelings.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
