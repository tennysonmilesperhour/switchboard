import Link from 'next/link';
import { Glyph } from '@/components/ui/Glyph';

export interface HomePillar {
  href: string;
  emoji: string;
  title: string;
  body: string;
}

/**
 * The product doors, given equal weight — but only the ones with something
 * behind them.
 *
 * Home used to bury these: availability sat at the top as a chip row, plans
 * were the feed, and Mutual and Zones were two of four tiles in a
 * "Make something happen" grid below every conditional section — so which
 * pathways a person noticed depended on how much of their Home was populated.
 * Home now puts urgent invitations, the plan feed, and one guidance card
 * first; this row is the stable set of doors after that focused sequence.
 *
 * The set is gated rather than fixed (remediation 18): a person with no graph
 * and no local density gets exactly the three doors that do something for them.
 * Mutual and I'm free are empty rooms without a connection; Around is an empty
 * room without an anchored zone or a live sharer in the viewer's city.
 *
 * Deliberately not styled with the brand gradient: the moment one tile gets the
 * loud treatment, the row stops being equal doors and becomes one CTA with
 * also-rans. `PRODUCT.md` asks for the next social action to be obvious, and
 * the feed above still carries that weight — this row is for breadth.
 */
const CORE_PILLARS: readonly HomePillar[] = [
  {
    href: '/create',
    emoji: '🪜',
    title: 'Make a plan',
    body: 'Invite in your order',
  },
  {
    href: '/people',
    emoji: '👥',
    title: 'People',
    body: 'Find your people',
  },
  {
    href: '/plans',
    emoji: '🗓️',
    title: 'Plans',
    body: 'See what’s ahead',
  },
];

const SOCIAL_PILLARS: readonly HomePillar[] = [
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
];

const AROUND_PILLAR: HomePillar = {
  href: '/map',
  emoji: '🧭',
  title: 'Around',
  body: 'See what’s happening',
};

/**
 * Keep the first-run promise exact: without a graph or local density, Home has
 * only the three useful doors. Social and serendipity doors appear when they
 * have something behind them.
 */
export function homePillars({
  hasConnections,
  showAround,
}: {
  hasConnections: boolean;
  showAround: boolean;
}): HomePillar[] {
  return [
    ...CORE_PILLARS,
    ...(hasConnections ? SOCIAL_PILLARS : []),
    ...(showAround ? [AROUND_PILLAR] : []),
  ];
}

export function PillarRow({
  hasConnections,
  showAround,
}: {
  hasConnections: boolean;
  showAround: boolean;
}) {
  const pillars = homePillars({ hasConnections, showAround });

  return (
    <nav aria-label="What Switchboard is for">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {pillars.map((pillar) => (
          <li key={pillar.href}>
            <Link
              href={pillar.href}
              className="flex h-full min-h-11 flex-col rounded-card border border-line bg-card p-3 shadow-lift transition-all hover:border-terracotta hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta active:scale-[0.98]"
            >
              <Glyph emoji={pillar.emoji} size={24} />
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
