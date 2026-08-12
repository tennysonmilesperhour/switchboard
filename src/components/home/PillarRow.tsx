import Link from 'next/link';

/**
 * The four things Switchboard is for, given equal weight.
 *
 * Home used to bury these: availability sat at the top as a chip row, plans
 * were the feed, and Mutual and Zones were two of four tiles in a
 * "Make something happen" grid below every conditional section — so which
 * pathways a person noticed depended on how much of their Home was populated.
 * These four are the product's pillars, so they get one row, one size, one
 * tone, above everything that varies.
 *
 * Deliberately not styled with the brand gradient: the moment one tile gets the
 * loud treatment, the row stops being four equal doors and becomes one CTA with
 * three also-rans. `PRODUCT.md` asks for the next social action to be obvious,
 * and the feed below still carries that weight — this row is for breadth.
 */
const PILLARS = [
  {
    href: '/create',
    emoji: '🪜',
    title: 'Make a plan',
    body: 'Invite in your order',
  },
  {
    href: '/mutual',
    emoji: '◐',
    title: 'Mutual',
    body: 'Down to connect?',
  },
  {
    // Availability lives on this page already, so the pillar points at it
    // rather than duplicating the composer somewhere else.
    href: '#signals',
    emoji: '🟢',
    title: 'I’m free',
    body: 'Tell just your circles',
  },
  {
    href: '/zones',
    emoji: '🎪',
    title: 'Zones',
    body: 'Who else is here',
  },
] as const;

export function PillarRow() {
  return (
    <nav aria-label="What Switchboard is for">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PILLARS.map((pillar) => (
          <li key={pillar.href}>
            <Link
              href={pillar.href}
              className="flex h-full min-h-11 flex-col rounded-card border border-line bg-card p-3 shadow-lift transition-all hover:border-terracotta hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta active:scale-[0.98]"
            >
              <span className="text-2xl" aria-hidden>
                {pillar.emoji}
              </span>
              <span className="mt-1.5 font-bold text-ink">{pillar.title}</span>
              <span className="mt-0.5 text-xs leading-snug text-ink-faint">
                {pillar.body}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
