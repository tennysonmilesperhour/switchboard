import type { Metadata } from 'next';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { getUser } from '@/lib/supabase/server';
import { reportOperationalError } from '@/lib/server/observability';
import { formatDateTime } from '@/lib/format';
import { serializeJsonLd } from '@/lib/security';
import { resolveEventZone } from '@/lib/server/event-zone';
import { eventSharePath } from '@/lib/links';
import { Icon } from '@/components/ui/Icon';
import { RsvpSignInGate } from '@/components/events/RsvpSignInGate';
import { ShareLinkRsvp } from './ShareLinkRsvp';

/**
 * The public share link for a plan: `/i/<share_token>`.
 *
 * This is the one link a host can text to anyone. Reading it works signed out,
 * on a new device, with no Switchboard account — the unguessable token is the
 * authorization (docs/SECURITY.md §5), exactly as it is for `/rsvp/<token>` and
 * the calendar feed. Only the RSVP asks for a session: a signed-out visitor sees
 * the whole plan plus a sign-in gate that returns them here to answer.
 *
 * Deliberately NOT reached through `/events/<id>` (RLS-gated: dead for anyone
 * not already invited) or `/join/<id>` (needs an account, host approval, and the
 * open_table flag). Those two are why shared links kept arriving broken.
 */

interface ShareEvent {
  id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_address: string | null;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string | null;
  host_id: string;
  status: string;
  share_link_active: boolean;
}

const EVENT_FIELDS =
  'id, title, description, location_name, location_address, starts_at, ends_at, ' +
  'time_zone, host_id, status, share_link_active';

/** Plans that can still take an answer through the link. */
function isAccepting(event: ShareEvent): boolean {
  return event.share_link_active && (event.status === 'inviting' || event.status === 'confirmed');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  if (!hasAdminCredentials()) return { title: 'You’re invited' };

  const { token } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, share_link_active')
    .eq('share_token', token)
    .maybeSingle<{ id: string; title: string; share_link_active: boolean }>();

  const title =
    event && event.share_link_active ? `You’re invited: ${event.title}` : 'You’re invited';
  return {
    title,
    openGraph: {
      title,
      images: event && event.share_link_active ? [`/api/og/event/${event.id}`] : [],
    },
  };
}

export default async function SharedInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = hasAdminCredentials() ? createAdminClient() : null;

  // Without a service-role key this page can resolve no plan at all, so it would
  // tell every recipient their invitation is dead — a server misconfiguration
  // masquerading as an expired link. Fail loudly in production (logged + error
  // boundary); keep the graceful fallback locally and in CI, where admin
  // credentials are routinely absent. Same posture as /rsvp and /join.
  if (!admin && process.env.NODE_ENV === 'production') {
    await reportOperationalError(
      'share-link.lookup',
      new Error('Supabase admin credentials are not configured'),
    );
    throw new Error('This invite link is unavailable: server is misconfigured');
  }

  // A genuine query error must surface, not collapse into a friendly "expired"
  // message — that swallow is what made a schema-drifted deployment look like a
  // withdrawn invitation for weeks.
  const { data: event, error: eventError } = admin
    ? await admin
        .from('events')
        .select(EVENT_FIELDS)
        .eq('share_token', token)
        .maybeSingle<ShareEvent>()
    : { data: null, error: null };
  if (eventError) {
    await reportOperationalError('share-link.event-lookup', eventError, {});
    throw new Error('Invite link lookup failed');
  }

  const { data: host } = event && admin
    ? await admin
        .from('profiles')
        .select('display_name')
        .eq('id', event.host_id)
        .maybeSingle<{ display_name: string }>()
    : { data: null };

  // Who is reading this decides which half of the page they get: the answer
  // buttons (signed in, RSVP attached to their account, name already known) or
  // the sign-in gate. Resolve defensively — the anon client throws when its
  // credentials aren't configured, and that must never break this public page,
  // whose job is to render the plan either way.
  const user = await getUser().catch(() => null);
  const { data: viewerProfile } = user && admin
    ? await admin
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle<{ display_name: string }>()
    : { data: null };

  const zone = admin && event ? await resolveEventZone(admin, event) : null;
  const live = event ? isAccepting(event) : false;

  const jsonLd = event && live
    ? {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: event.title,
        ...(event.description ? { description: event.description } : {}),
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
          Switch<span className="text-terracotta">board</span>
        </span>
      </header>
      <main className="flex-1 flex flex-col justify-center pb-24">
        {!event || !live ? (
          <div className="text-center">
            <p className="text-4xl mb-3" aria-hidden>🍂</p>
            <h1 className="font-extrabold tracking-tight text-2xl">
              This invite link isn’t active
            </h1>
            <p className="text-ink-soft text-sm mt-2">
              It may have been turned off, or the plan has wrapped up. Ask
              whoever sent it for a fresh link.
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
            <p className="mt-3 text-ink font-bold">
              {formatDateTime(event.starts_at, zone)}
            </p>
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
            {jsonLd && (
              <script
                type="application/ld+json"
                // serializeJsonLd, not raw JSON.stringify: a host-controlled
                // title/description containing `</script>` must not be able to
                // break out of the tag on this public page.
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
              />
            )}
            {user ? (
              <ShareLinkRsvp
                shareToken={token}
                defaultName={viewerProfile?.display_name ?? ''}
              />
            ) : (
              <RsvpSignInGate
                next={eventSharePath(token)}
                hostName={host?.display_name ?? undefined}
              />
            )}
            <p className="text-xs text-ink-faint mt-10 leading-relaxed">
              Switchboard makes plans without pressure - invitations flow one
              person at a time, so nobody feels like a backup. If you can’t make
              it, the invitation quietly moves along. No hard feelings.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
