import Link from 'next/link';

/**
 * Shown on the public guest RSVP page when the visitor isn't signed in. An
 * invite link is often someone's first touch with Switchboard, so give them a
 * warm nudge to create an account (or sign in) and stay connected with the host
 * — without getting in the way of the RSVP itself. Both links carry `next` so
 * the guest lands back on this invitation after authenticating.
 */
export function JoinPrompt({
  hostName,
  next,
}: {
  hostName: string;
  next: string;
}) {
  const encodedNext = encodeURIComponent(next);
  return (
    <section className="mt-10 rounded-card border border-line bg-cream p-5">
      <p className="text-sm font-bold tracking-wide uppercase text-terracotta-deep">
        New here?
      </p>
      <h2 className="mt-1 font-extrabold tracking-tight text-lg text-ink text-balance">
        Stay in the loop with {hostName}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {hostName} plans on Switchboard — invitations that flow one person at a
        time, no group-text chaos. Create an account to keep up with {hostName}
        {' '}and get your own invitations.
      </p>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <Link
          href={`/login?mode=create&next=${encodedNext}`}
          className="inline-flex flex-1 items-center justify-center rounded-btn bg-brand-gradient px-5 py-3 font-bold text-white shadow-lift transition hover:brightness-105"
        >
          Create account
        </Link>
        <Link
          href={`/login?next=${encodedNext}`}
          className="inline-flex flex-1 items-center justify-center rounded-btn border border-line bg-card px-5 py-3 font-bold text-ink transition hover:border-terracotta hover:text-terracotta"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}
