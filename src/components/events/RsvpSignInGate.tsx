import Link from 'next/link';

/**
 * The sign-in step that stands in for the RSVP buttons on a public invitation
 * link, for a visitor who isn't signed in.
 *
 * The split it enforces: the plan itself — who's hosting, when, where, what it
 * is — is readable by anyone holding the link, with no account and no app. Only
 * *answering* needs a session, so the host gets a person they can see, thank,
 * and invite again instead of an anonymous name, and the guest gets the plan in
 * their app rather than in one link they have to keep track of.
 *
 * Both links carry `next`, so authenticating returns the visitor to this exact
 * invitation with the answer buttons live — never to a generic home screen,
 * which is how a texted link turns into a dead end.
 */
export function RsvpSignInGate({
  next,
  hostName,
}: {
  /** App-relative path back to this invitation, e.g. `/i/<token>`. */
  next: string;
  /** Used to make the ask concrete: "so {host} knows who's coming". */
  hostName?: string;
}) {
  const encodedNext = encodeURIComponent(next);
  const who = hostName?.trim() || 'your host';
  return (
    <section className="mt-8 rounded-card border border-line bg-cream p-5">
      <p className="text-sm font-bold tracking-wide uppercase text-terracotta-deep">
        To answer
      </p>
      <h2 className="mt-1 font-extrabold tracking-tight text-lg text-ink text-balance">
        Sign in to RSVP
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Reading the plan is open to anyone with the link. Answering takes an
        account, so {who} knows who’s coming — and so the plan lands in your app
        with the address, any updates, and a way to change your mind later.
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
      <p className="mt-3 text-xs text-ink-faint">
        Takes a minute, and you come right back here to answer.
      </p>
    </section>
  );
}
