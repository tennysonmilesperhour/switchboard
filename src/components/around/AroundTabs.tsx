import Link from 'next/link';

export type AroundSurface = 'map' | 'zones' | 'moments';

export const AROUND_TABS = [
  { id: 'map', href: '/map', label: 'Map' },
  { id: 'zones', href: '/zones', label: 'Zones' },
  { id: 'moments', href: '/moments', label: 'Moments' },
] as const;

/** The three serendipity surfaces share one stable entry and one local nav. */
export function AroundTabs({ active }: { active: AroundSurface }) {
  return (
    <nav aria-label="Around">
      <ul className="grid grid-cols-3 rounded-card border border-line bg-card p-1 shadow-lift">
        {AROUND_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={selected ? 'page' : undefined}
                className={`flex min-h-11 items-center justify-center rounded-btn px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                  selected
                    ? 'bg-ink text-paper shadow-lift'
                    : 'text-ink-faint hover:bg-cream hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
