import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Switchboard - plans without pressure',
};

const FEATURES = [
  {
    emoji: '🪜',
    title: 'Cascading Invites',
    body: 'Invite people one at a time, in your order. If someone accepts, it stops. No group-text chaos, no one feels like a backup.',
  },
  {
    emoji: '🗳️',
    title: 'Anonymous Weighted Input',
    body: 'Everyone ranks options privately - and says how strongly they feel. The best idea rises without anyone dominating.',
  },
  {
    emoji: '◐',
    title: 'Mutual Mode',
    body: 'Quietly mark who you’d love to grab coffee with. If they pick you too, you both find out. If not, no one ever knows.',
  },
  {
    emoji: '🟢',
    title: 'Availability Signals',
    body: 'One tap says "I’m around." Friends discover it naturally - no broadcast, no pressure, no explanation needed.',
  },
  {
    emoji: '❋',
    title: 'Living Rooms',
    body: 'Conversations where the addresses, photos, tasks, and plans file themselves. Stop scrolling to find that one message.',
  },
  {
    emoji: '✨',
    title: 'Shared Moments',
    body: 'Same airport, same layover, same taste in conversation? Switchboard notices - and only introduces you if you’re both curious.',
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-xl font-extrabold lowercase tracking-tight text-terracotta">
          switchboard
        </span>
        <Link
          href="/login"
          className="text-sm font-bold text-ink hover:text-terracotta"
        >
          Sign in
        </Link>
      </header>

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
            href="/login"
            className="inline-flex items-center justify-center rounded-btn bg-brand-gradient px-7 py-4 text-white font-bold shadow-lift hover:brightness-105 transition"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-btn border border-line bg-card px-7 py-4 font-bold text-ink hover:border-terracotta hover:text-terracotta transition"
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
          href="/login"
          className="mt-8 inline-flex items-center rounded-btn bg-ink px-7 py-4 text-paper font-bold hover:opacity-90 transition-opacity"
        >
          Join Switchboard
        </Link>
      </section>

      <footer className="pb-10 text-center text-xs text-ink-faint">
        © 2026 Switchboard
      </footer>
    </div>
  );
}
