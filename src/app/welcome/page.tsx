import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Switchboard — plans without pressure',
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
    body: 'Everyone ranks options privately — and says how strongly they feel. The best idea rises without anyone dominating.',
  },
  {
    emoji: '◐',
    title: 'Mutual Mode',
    body: 'Quietly mark who you’d love to grab coffee with. If they pick you too, you both find out. If not, no one ever knows.',
  },
  {
    emoji: '🟢',
    title: 'Availability Signals',
    body: 'One tap says "I’m around." Friends discover it naturally — no broadcast, no pressure, no explanation needed.',
  },
  {
    emoji: '❋',
    title: 'Living Rooms',
    body: 'Conversations where the addresses, photos, tasks, and plans file themselves. Stop scrolling to find that one message.',
  },
  {
    emoji: '✨',
    title: 'Shared Moments',
    body: 'Same airport, same layover, same taste in conversation? Switchboard notices — and only introduces you if you’re both curious.',
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="font-display text-xl">Switchboard</span>
        <Link
          href="/login"
          className="text-sm font-medium text-terracotta-deep hover:underline underline-offset-4"
        >
          Sign in
        </Link>
      </header>

      <section aria-labelledby="hero-heading" className="pt-10 pb-14">
        <p className="text-sm font-medium tracking-wide uppercase text-terracotta-deep mb-4">
          Connect without pressure
        </p>
        <h1
          id="hero-heading"
          className="font-display text-[2.9rem] leading-[1.04] text-ink"
        >
          Plans without
          <br />
          the <em className="text-terracotta not-italic">pressure</em>.
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-soft max-w-sm">
          Reaching out is hard. Switchboard handles the awkward parts —
          the asking, the waiting, the deciding — so more of your moments
          actually happen.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center rounded-pill bg-terracotta px-7 py-3.5 text-white font-medium shadow-lift hover:bg-terracotta-deep transition-colors"
          >
            Get started
          </Link>
          <span className="text-sm text-ink-faint">Free while in beta</span>
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
                <h2 className="font-display text-lg text-ink">{feature.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {feature.body}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="pb-20 text-center">
        <p className="font-display text-2xl leading-snug text-ink max-w-xs mx-auto">
          Connection still belongs to people. Switchboard just makes it easier
          to find one another.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex items-center rounded-pill bg-ink px-7 py-3.5 text-paper font-medium hover:opacity-90 transition-opacity"
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
