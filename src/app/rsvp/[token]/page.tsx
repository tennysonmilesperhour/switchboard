import type { Metadata } from 'next';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { getUser } from '@/lib/supabase/server';
import { reportOperationalError } from '@/lib/server/observability';
import { formatDateTime } from '@/lib/format';
import { resolveEventZone } from '@/lib/server/event-zone';
import { Icon } from '@/components/ui/Icon';
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
    .maybeSingle<{ event_id: string }>();
  const { data: event } = invite
    ? await admin
        .from('events')
        .select('title')
        .eq('id', invite.event_id)
        .maybeSingle<{ title: string }>()
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

/** Public guest RSVP - reached via an unguessable token link, no account needed. */
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
        .select('id, event_id, status, guest_name')
        .eq('guest_token', token)
        .maybeSingle<{
          id: string;
          event_id: string;
          status: string;
          guest_name: string | null;
        }>()
    : { data: null, error: null };
  if (inviteError) {
    await reportOperationalError('rsvp.invite-lookup', inviteError, {});
    throw new Error('Guest RSVP lookup failed');
  }

  const { data: event, error: eventError } = invite && admin
    ? await admin
        .from('events')
        .select('title, description, location_name, starts_at, time_zone, host_id')
        .eq('id', invite.event_id)
        .maybeSingle<{
          title: string;
          description: string | null;
          location_name: string | null;
          starts_at: string | null;
          time_zone: string | null;
          host_id: string;
        }>()
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
        .maybeSingle<{ display_name: string }>()
    : { data: null };

  // Host-defined RSVP questions, if any.
  const { data: questionRows } = invite && admin
    ? await admin
        .from('event_questions')
        .select('id, prompt, required')
        .eq('event_id', invite.event_id)
        .order('position')
    : { data: null };
  const questions = (questionRows ?? []).map((q) => ({
    id: q.id as string,
    prompt: q.prompt as string,
    required: q.required as boolean,
  }));

  // An invite link is often a guest's first contact with Switchboard. If they
  // aren't signed in, we nudge them to join or sign in (below) so they can stay
  // connected with the host — but the RSVP itself never requires an account.
  // Resolve the viewer defensively: the anon Supabase client throws when its
  // credentials aren't configured (CI and local e2e run the app without them),
  // and a missing session must never break this public page — so treat an
  // unresolved viewer as logged-out.
  const user = await getUser().catch(() => null);
  const hostName = host?.display_name ?? 'Your host';
  // Show the plan's local time, not the server's UTC. Falls back to the host's
  // profile zone for plans created before the zone was captured on the event.
  const zone = admin ? await resolveEventZone(admin, event) : null;

  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="py-6">
        <span className="font-extrabold tracking-tight text-xl">
          Switch<span className="text-terracotta">board</span>
        </span>
      </header>
      <main className="flex-1 flex flex-col justify-center pb-24">
        {!invite || !event ? (
          <div className="text-center">
            <p className="text-4xl mb-3" aria-hidden>🍂</p>
            <h1 className="font-extrabold tracking-tight text-2xl">This invitation isn’t here anymore</h1>
            <p className="text-ink-soft text-sm mt-2">
              It may have expired or been withdrawn.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold tracking-wide uppercase text-terracotta-deep">
              {host?.display_name ?? 'A friend'} invited you
            </p>
            <h1 className="font-extrabold tracking-tight text-4xl text-ink mt-2 text-balance">
              {event.title}
            </h1>
            <p className="mt-3 text-ink font-bold">{formatDateTime(event.starts_at, zone)}</p>
            {event.location_name && (
              <p className="text-ink-soft text-sm mt-1 inline-flex items-center gap-1.5">
                <Icon name="mapPin" size={15} className="text-terracotta" />
                {event.location_name}
              </p>
            )}
            {event.description && (
              <p className="text-ink-soft text-sm mt-3 leading-relaxed">
                {event.description}
              </p>
            )}
            <GuestRsvpClient
              token={token}
              guestName={invite.guest_name ?? 'there'}
              initialStatus={invite.status}
              questions={questions}
            />
            {!user && <JoinPrompt hostName={hostName} next={`/rsvp/${token}`} />}
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
