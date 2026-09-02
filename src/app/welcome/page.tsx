import Link from 'next/link';
import type { Metadata } from 'next';
import { safeNextPath } from '@/lib/security';

/**
 * This is where `appInviteUrl()` lands (src/lib/links.ts): the bare origin
 * redirects a signed-out visitor here, so this page's metadata *is* the preview
 * that renders when someone texts a friend the app.
 *
 * `title.absolute` because the root layout's template is `'%s · Switchboard'`,
 * and a plain string here went through it — the link preview and the browser tab
 * both read "Switchboard - plans without pressure · Switchboard".
 *
 * The `openGraph` block is what makes the link arrive as a card rather than a
 * bare URL. `/welcome/opengraph-image.tsx` supplies the image; Next resolves it
 * against `metadataBase` in the root layout.
 */
const PITCH =
  'Reaching out is hard. Switchboard handles the awkward parts, the asking, ' +
  'the waiting, the deciding, so more of your moments actually happen.';

export const metadata: Metadata = {
  title: { absolute: 'Switchboard - plans without pressure' },
  description: PITCH,
  openGraph: {
    type: 'website',
    siteName: 'Switchboard',
    title: 'Switchboard - plans without pressure',
    description: PITCH,
    url: '/welcome',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Switchboard - plans without pressure',
    description: PITCH,
  },
};

const FEATURES = [
  {
    emoji: '📅',
    title: 'Make a plan',
    body: 'Invite people without a chaotic group text. Switchboard handles the asking, reminders, and details.',
  },
  {
    emoji: '✨',
    title: 'Find the mutual yes',
    body: 'Share interest privately. Both people hear about it only when the feeling matches.',
  },
  {
    emoji: '💬',
    title: 'Keep everything together',
    body: 'Each plan gets one Living Room for the conversation, address, photos, tasks, and shared costs.',
  },
] as const;

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; next?: string }>;
}) {
  const { account, next } = await searchParams;
  // A deep link (e.g. a shared /events/… link) arrives here as ?next when a
  // signed-out visitor is bounced off a protected route. Carry it onto the auth
  // links so they land back on it once signed in. Validated to a same-site path.
  const nextPath = safeNextPath(next, '');
  const loginHref = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login';
  const createHref = nextPath
    ? `/login?mode=create&next=${encodeURIComponent(nextPath)}`
    : '/login?mode=create';
  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-xl font-extrabold lowercase tracking-tight text-terracotta-deep">
          switchboard
        </span>
        <Link
          href={loginHref}
          className="inline-flex min-h-11 items-center text-sm font-bold text-ink hover:text-terracotta-deep"
        >
          Sign in
        </Link>
      </header>

      <main>
      {account === 'deleted' && (
        <p
          role="status"
          className="mb-6 rounded-card bg-sage-soft p-4 text-sm text-sage-deep"
        >
          Your account was deleted. Thanks for spending time with Switchboard.
          You’re always welcome back.
        </p>
      )}

      <section aria-labelledby="hero-heading" className="pt-12 pb-14">
        <h1
          id="hero-heading"
          className="text-6xl font-black leading-[0.95] tracking-tight text-ink"
        >
          Make plans.
          <br />
          <span className="bg-brand-gradient bg-clip-text text-transparent">
            Like magic.
          </span>
        </h1>
        <p className="mt-6 text-[17px] leading-relaxed text-ink-soft max-w-sm">
          Reaching out is hard. Switchboard handles the awkward parts, the
          asking, the waiting, the deciding, so more of your moments actually
          happen.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href={createHref}
            className="inline-flex items-center justify-center rounded-btn bg-brand-gradient px-7 py-4 text-white font-bold shadow-lift hover:brightness-105 transition"
          >
            Create account
          </Link>
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center rounded-btn border border-line bg-card px-7 py-4 font-bold text-ink hover:border-terracotta hover:text-terracotta-deep transition"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section aria-label="Features" className="pb-16 space-y-3">
        {FEATURES.map((feature, i) => (
          <article
            key={feature.title}
            className={`rounded-card border border-line p-5 ${
              i % 3 === 0 ? 'bg-cream' : i % 3 === 1 ? 'bg-card' : 'bg-gold-soft'
            }`}
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5" aria-hidden>
                {feature.emoji}
              </span>
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-ink">
                  {feature.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {feature.body}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="pb-20 text-center">
        <p className="text-2xl font-extrabold leading-snug tracking-tight text-ink max-w-xs mx-auto">
          Connection still belongs to people. Switchboard just makes it easier
          to find one another.
        </p>
        <Link
          href={createHref}
          className="mt-8 inline-flex items-center rounded-btn bg-ink px-7 py-4 text-paper font-bold hover:opacity-90 transition-opacity"
        >
          Join Switchboard
        </Link>
      </section>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-10 text-center text-xs text-ink-soft">
        <span>© 2026 Switchboard</span>
        <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-ink">Privacy</Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-ink">Terms</Link>
        <Link href="/community" className="inline-flex min-h-11 items-center hover:text-ink">Community</Link>
        <Link href="/copyright" className="inline-flex min-h-11 items-center hover:text-ink">Copyright</Link>
      </footer>
    </div>
  );
}
