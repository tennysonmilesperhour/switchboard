import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { reportOperationalError } from '@/lib/server/observability';
import { formatDateTime } from '@/lib/format';
import { resolveEventZone } from '@/lib/server/event-zone';
import { eventSharePath } from '@/lib/links';
import { inviteOpenGraph, unfurlSummary } from '@/lib/invite-links';
import {
  canReadPlan,
  canRequestOpenTable,
  shareLinkNotice,
  shareLinkState,
  unfurlsPlanDetails,
} from '@/lib/share-link';
import { errorRef } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { JoinViaLinkClient } from './JoinViaLinkClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  if (!hasAdminCredentials()) return { title: 'You’re invited' };
  const { id } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, status, share_link_active, description, location_name')
    .eq('id', id)
    .maybeSingle();
  // The same decision, and the same card builder, as /i/<token>. This used to
  // gate on `open_table` alone, so a crawler holding a bare id was told the
  // title of a draft, cancelled, past, or switched-off plan — none of which
  // the share link itself will unfurl.
  const unfurl = unfurlsPlanDetails(shareLinkState(event));
  const title = event && unfurl ? `You’re invited: ${event.title}` : 'You’re invited';
  return {
    title,
    openGraph: inviteOpenGraph({
      title,
      description: event && unfurl ? unfurlSummary(event) : null,
      image: event && unfurl ? `/api/og/event/${event.id}` : null,
    }),
  };
}

/**
 * Public join page reached via a host's shareable invite link. Unlike the
 * event page (which is RLS-locked to the host and already-invited people), this
 * reads through the service-role client so someone who isn't on the plan yet can
 * still see it and ask to join. To anyone not already on the plan it only ever
 * reveals a plan the host has opted to share (open_table) whose share link
 * `canReadPlan` allows — the same answer `/i/<token>` gives — and asking to
 * join goes through the same request/approve flow as an open table, so the
 * host still approves every person.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = hasAdminCredentials() ? createAdminClient() : null;
  // Mirror the guest RSVP page: without a service-role key this page can look up
  // nothing, so in production fail loudly rather than telling every visitor the
  // link is dead. Locally/CI (no admin creds) keeps the graceful fallback.
  if (!admin && process.env.NODE_ENV === 'production') {
    await reportOperationalError(
      'join.lookup',
      new Error('Supabase admin credentials are not configured'),
    );
    throw new Error('Join is unavailable: server is misconfigured');
  }

  const { data: event, error: eventError } = admin
    ? await admin
        .from('events')
        .select('id, title, description, location_name, starts_at, time_zone, host_id, status, open_table, share_token, share_link_active')
        .eq('id', id)
        .maybeSingle()
    : { data: null, error: null };
  if (eventError) {
    await reportOperationalError('join.event-lookup', eventError, {});
    throw new Error('Join lookup failed');
  }

  // Every /join/<id> link already out in the world — texted, pasted into group
  // chats, sitting in someone's messages from weeks ago — forwards to the plan's
  // public share link. Those were the broken ones: they demanded an account,
  // then host approval, then open_table, and dead-ended if any of the three was
  // missing. Forwarding resurrects them rather than stranding the people who
  // were already sent one.
  //
  // Forward on canReadPlan, not on share_link_active alone: the share page is
  // only a better destination than this one when it will actually render the
  // plan there. When it won't, this page keeps the visitor and explains why,
  // using the same classifier so the two pages cannot contradict each other.
  const shareState = shareLinkState(event);
  const shareReadable = canReadPlan(shareState);
  if (event && shareReadable && !user) {
    redirect(eventSharePath(event.share_token));
  }

  // Figure out how the signed-in viewer already relates to this plan. Anyone
  // who can actually see the event page (host, co-host, or an invitee whose
  // invite is live) is sent straight there. People who are involved but
  // *can't* yet view it — an invitee still queued in the line — get a gentle
  // heads-up instead of a redirect that would bounce, and never the
  // ask-to-join button (asking again would just error "already involved").
  //
  // A co-host used to be in that second group: `can_view_event` left them out,
  // so "Open your plan" on /i/<token> sent them to /events/<id>, which sent
  // them here. Since 20260930010000 co-hosts pass the policy and are
  // redirected like the host; the co-host lookup below stays as a backstop.
  let alreadyInvolved = false;
  if (event && user) {
    // Ask the same row-level policy the event page reads through, rather than
    // restating it here: if a restated copy ever disagreed with the database,
    // /events/<id> and /join/<id> would send the viewer back and forth forever.
    const { data: visible } = await supabase
      .from('events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle();
    if (visible) redirect(`/events/${event.id}`);

    const { data: existing } = admin
      ? await admin
          .from('invites')
          .select('status')
          .eq('event_id', event.id)
          .eq('invitee_id', user.id)
          .maybeSingle()
      : { data: null };
    const { data: cohost } = admin
      ? await admin
          .from('event_cohosts')
          .select('cohost_id')
          .eq('event_id', event.id)
          .eq('cohost_id', user.id)
          .maybeSingle()
      : { data: null };
    alreadyInvolved = existing != null || cohost != null;

    // A signed-in visitor with no connection to the plan is in the same
    // position as a stranger: send them to the share link, where they can
    // actually respond, instead of an ask-to-join button that waits on the host.
    if (!alreadyInvolved && shareReadable) {
      redirect(eventSharePath(event.share_token));
    }
  }

  const host =
    event && admin
      ? (
          await admin
            .from('profiles')
            .select('display_name')
            .eq('id', event.host_id)
            .maybeSingle()
        ).data
      : null;

  // Who may read the plan here. Someone already on it may (see below). Anyone
  // else needs the host to have opened the table AND a share link that
  // share-link.ts says is readable — the same answer /i/<token> gives, so the
  // two pages cannot disagree about a link that is off or a plan still in
  // draft. `open_table` alone used to be enough, which rendered a switched-off
  // or unpublished plan to any stranger holding its id.
  //
  // In practice a readable link has already forwarded any stranger to
  // /i/<token> above, so only people already involved reach the plan view
  // here; asking to join an Open Table happens on Discover.
  const shareable = Boolean(event?.open_table) && shareReadable;
  const accepting = canRequestOpenTable(event?.status);
  // Why this page has nothing to show, in the plan's own terms rather than one
  // catch-all sentence. Anyone reaching the dead-end branch got here because the
  // canonical share link couldn't take them, so its reason is the right one.
  // `live` is unreachable in the dead-end branch (a readable link redirects
  // above), so fall back to the off/missing copy rather than an empty card.
  const notice =
    shareLinkNotice(shareState, host?.display_name) ?? shareLinkNotice('off');
  // Render the plan in its own zone, not the server's UTC.
  const zone = admin ? await resolveEventZone(admin, event) : null;

  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="py-6">
        <span className="font-extrabold tracking-tight text-xl">
          Switch<span className="text-terracotta-deep">board</span>
        </span>
      </header>
      <main className="flex-1 flex flex-col justify-center pb-24">
        {/* `alreadyInvolved` keeps the plan visible for someone who is on it but
            can't see the event page yet (a queued invitee). Telling them their
            invite link "isn't active" while they are
            literally on the guest list is the same misleading dead end this page
            exists to undo — open_table governs who may ASK to join, not who may
            read a plan they are already part of. */}
        {!event || (!shareable && !alreadyInvolved) ? (
          <div className="text-center">
            <p className="text-4xl mb-3" aria-hidden>🍂</p>
            <h1 className="font-extrabold tracking-tight text-2xl">
              {notice?.heading ?? 'This invite link isn’t active'}
            </h1>
            <p className="text-ink-soft text-sm mt-2">{notice?.body}</p>
            {notice && (
              <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                {errorRef(notice.code)}
              </p>
            )}
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
                <Icon name="mapPin" size={15} className="text-terracotta-deep" />
                {event.location_name}
              </p>
            )}
            {event.description && (
              <p className="text-ink-soft text-sm mt-3 leading-relaxed">
                {event.description}
              </p>
            )}

            <div className="mt-8">
              {alreadyInvolved ? (
                <p className="rounded-card bg-cream px-4 py-3 text-sm text-ink-soft">
                  You’re already on the list for this plan - hang tight, the host
                  will keep you posted.
                </p>
              ) : !accepting ? (
                <p className="rounded-card bg-cream px-4 py-3 text-sm text-ink-soft">
                  This plan isn’t taking new requests right now.
                </p>
              ) : user ? (
                <JoinViaLinkClient eventId={event.id} eventTitle={event.title} />
              ) : (
                <div className="space-y-3">
                  <Link
                    href={`/login?next=${encodeURIComponent(`/join/${event.id}`)}`}
                    className="block"
                  >
                    <Button size="lg" className="w-full">
                      Sign in to ask to join
                    </Button>
                  </Link>
                  <p className="text-xs text-ink-faint text-center">
                    You’ll need a free Switchboard account so the host knows who’s asking.
                  </p>
                </div>
              )}
            </div>

            <p className="text-xs text-ink-faint mt-10 leading-relaxed">
              Switchboard makes plans without pressure. Asking to join is never
              presumptuous - the host approves every request, and you’ll hear back
              either way.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
