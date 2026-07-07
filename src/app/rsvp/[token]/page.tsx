import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDateTime } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import { GuestRsvpClient } from './GuestRsvpClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('event_id, event:events(title)')
    .eq('guest_token', token)
    .maybeSingle();
  const event = invite
    ? (Array.isArray(invite.event) ? invite.event[0] : invite.event)
    : null;
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
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('invites')
    .select(
      'id, event_id, status, guest_name, event:events(title, description, location_name, starts_at, host:profiles(display_name))',
    )
    .eq('guest_token', token)
    .maybeSingle();

  // Host-defined RSVP questions, if any.
  const { data: questionRows } = invite
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

  const event = invite
    ? ((Array.isArray(invite.event) ? invite.event[0] : invite.event) as {
        title: string;
        description: string | null;
        location_name: string | null;
        starts_at: string | null;
        host: { display_name: string } | Array<{ display_name: string }> | null;
      } | null)
    : null;
  const host = event
    ? Array.isArray(event.host)
      ? event.host[0]
      : event.host
    : null;

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
            <p className="mt-3 text-ink font-bold">{formatDateTime(event.starts_at)}</p>
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
