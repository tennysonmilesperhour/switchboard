import type { Metadata } from 'next';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { getUser } from '@/lib/supabase/server';
import { reportOperationalError } from '@/lib/server/observability';
import { safeHttpUrl, serializeJsonLd } from '@/lib/security';
import { resolveEventZone } from '@/lib/server/event-zone';
import { eventSharePath } from '@/lib/links';
import { inviteOpenGraph, unfurlSummary } from '@/lib/invite-links';
import {
  canAnswer,
  canReadPlan,
  shareLinkNotice,
  shareLinkState,
  unfurlsPlanDetails,
} from '@/lib/share-link';
import { errorRef } from '@/lib/errors';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { InvitePlanDetails } from '@/components/events/InvitePlanDetails';
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
 *
 * Whether the link is readable and whether it is answerable are two different
 * questions, and neither is decided here — both come from `@/lib/share-link`, the
 * one module the host-side Share affordances ask as well. That shared answer is
 * what stops this page rejecting a link the app itself just handed out.
 */

const EVENT_FIELDS =
  'id, title, description, location_name, location_address, starts_at, ends_at, time_zone, host_id, status, share_link_active, cover_url, wishlist_url';

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
    .select('id, title, status, share_link_active, description, location_name, starts_at')
    .eq('share_token', token)
    .maybeSingle();

  // Same classifier as the page body, so the unfurl a recipient sees in their
  // messages app can never promise a plan the page then refuses to show.
  const unfurl = unfurlsPlanDetails(shareLinkState(event));
  const title = event && unfurl ? `You’re invited: ${event.title}` : 'You’re invited';
  return {
    title,
    openGraph: inviteOpenGraph({
      title,
      // Only what this link is already allowed to reveal: `unfurl` false means
      // the card falls back to the app's own line and says nothing of the plan.
      description: event && unfurl ? unfurlSummary(event) : null,
      image: event && unfurl ? `/api/og/event/${event.id}` : null,
    }),
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
        .maybeSingle()
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
        .maybeSingle()
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
        .maybeSingle()
    : { data: null };

  const zone = admin && event ? await resolveEventZone(admin, event) : null;

  // One classification, three decisions: whether the plan renders at all,
  // whether the answer buttons appear, and what the recipient is told alongside
  // them. A plan whose date is still being polled (status `deciding`) is both
  // readable and answerable — it used to fall into the same "isn't active" dead
  // end as a switched-off link, which is how a host running a date poll had
  // every recipient told their invitation was dead.
  const state = shareLinkState(event);
  const readable = canReadPlan(state);
  const answerable = canAnswer(state);
  const notice = shareLinkNotice(state, host?.display_name);

  // The host's RSVP questions, exactly as `/rsvp/<guest_token>` loads them.
  // Both links reach the same host, so a required question must not depend on
  // which one a guest was sent — this link used to take an answer without ever
  // asking, which left a host with questions nobody they texted had seen. Only
  // fetched where they can be shown: a link that is read but not answerable,
  // and an unfurl, have nothing to ask.
  const { data: questionRows } = answerable && event && user && admin
    ? await admin
        .from('event_questions')
        .select('id, prompt, required, kind, options')
        .eq('event_id', event.id)
        .order('position')
    : { data: null };
  const questions = (questionRows ?? []).map((q) => ({
    id: q.id,
    prompt: q.prompt,
    required: q.required,
    kind: q.kind === 'choice' ? ('choice' as const) : ('text' as const),
    options: q.options,
  }));

  const jsonLd = event && readable
    ? {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: event.title,
        ...(event.description ? { description: event.description } : {}),
        ...(safeHttpUrl(event.cover_url) ? { image: safeHttpUrl(event.cover_url) } : {}),
        ...(event.starts_at ? { startDate: event.starts_at } : {}),
        ...(event.ends_at ? { endDate: event.ends_at } : {}),
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        // The page now renders plans that are no longer taking answers, so the
        // structured data has to agree — a cancelled plan must not unfurl to
        // crawlers and assistants as a scheduled one.
        eventStatus:
          state === 'cancelled'
            ? 'https://schema.org/EventCancelled'
            : 'https://schema.org/EventScheduled',
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
        {!event || !readable ? (
          <div className="text-center">
            <p className="text-4xl mb-3" aria-hidden>🍂</p>
            <h1 className="font-extrabold tracking-tight text-2xl">
              {notice?.heading ?? 'This invite link isn’t active'}
            </h1>
            <p className="text-ink-soft text-sm mt-2">{notice?.body}</p>
            {/* The code, not just the sentence. Four different causes used to
                render this same page, so a screenshot of it narrowed nothing —
                this line is what makes "it says the link isn't active" into an
                answerable report. */}
            {notice && (
              <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                {errorRef(notice.code)}
              </p>
            )}
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
                // serializeJsonLd, not raw JSON.stringify: a host-controlled
                // title/description containing `</script>` must not be able to
                // break out of the tag on this public page.
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
              />
            )}
            {/* One notice, two jobs, decided by whether the plan can be
                answered. For a plan still picking its date it sits ABOVE the
                buttons as a caveat — "I'm in" there is a yes to the plan rather
                than to a time, and the date arrives later. For a plan that's
                behind us or called off it stands IN for the buttons, and there
                is deliberately no sign-in gate: signing in wouldn't change the
                answer, and sending someone to make an account to discover that
                is its own kind of broken link. */}
            {notice && (
              <ErrorNotice
                className="mt-8 rounded-card bg-cream px-4 py-3.5"
                message={notice.heading}
                fix={notice.body}
                code={notice.code}
              />
            )}
            {answerable &&
              (user ? (
                <ShareLinkRsvp
                  shareToken={token}
                  defaultName={viewerProfile?.display_name ?? ''}
                  questions={questions}
                />
              ) : (
                <RsvpSignInGate
                  next={eventSharePath(token)}
                  hostName={host?.display_name ?? undefined}
                />
              ))}
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
