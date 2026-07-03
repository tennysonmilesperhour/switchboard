'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/plans', label: 'Plans', icon: '✦' },
  { href: '/mutual', label: 'Mutual', icon: '◐' },
  { href: '/rooms', label: 'Rooms', icon: '❋' },
  { href: '/people', label: 'People', icon: '☺' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-card/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto max-w-lg grid grid-cols-5">
        {TABS.map((tab) => {
          const active =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? 'text-terracotta-deep' : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              <span
                className={`text-lg leading-none transition-transform ${active ? 'scale-110' : ''}`}
                aria-hidden
              >
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
