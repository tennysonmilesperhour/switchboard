import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { WALKTHROUGHS } from '@/lib/walkthroughs';

/**
 * The walkthroughs, at the top of the feature index. The short one leads, as
 * the one to rewatch; the rest each go deeper into one part of the app, to be
 * taken whenever someone is curious. All of them play themselves.
 */
export function WalkthroughList() {
  const primary = WALKTHROUGHS.find((tour) => tour.primary);
  const others = WALKTHROUGHS.filter((tour) => !tour.primary);

  return (
    <section id="walkthroughs" aria-labelledby="walkthroughs-heading" className="scroll-mt-20 space-y-3">
      <div className="text-plate text-plate-inset">
        <h2 id="walkthroughs-heading" className="font-display text-xl text-ink">
          Walkthroughs
        </h2>
        <p className="mt-0.5 text-sm text-ink-faint">
          Sit back and tap Next. Each one plays itself, with made-up people.
        </p>
      </div>

      {primary && (
        <Link
          href={`/tour/${primary.id}`}
          className="group flex items-center gap-4 rounded-card bg-brand-gradient p-4 text-white shadow-lift transition-all hover:brightness-105 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Icon name="play" size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-extrabold leading-tight">{primary.title}</span>
            <span className="mt-0.5 block text-sm text-white/85">{primary.hint}</span>
          </span>
        </Link>
      )}

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {others.map((tour) => (
          <li key={tour.id}>
            <Link
              href={`/tour/${tour.id}`}
              className="flex h-full items-start gap-3 rounded-card border border-line bg-card p-3.5 transition-colors hover:border-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-terracotta-soft text-terracotta-deep">
                <Glyph emoji={tour.emoji} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">{tour.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{tour.hint}</span>
                <span className="mt-1.5 block text-xs font-semibold text-ink-faint">
                  {tour.steps.length} steps
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
