import Link from 'next/link';

export interface HomePillar {
  href: string;
  emoji: string;
  title: string;
  body: string;
}

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
