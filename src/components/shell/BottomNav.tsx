'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';

type Tab = { href: string; label: string; icon: IconName };

const LEFT: Tab[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/discover', label: 'Explore', icon: 'search' },
];

const RIGHT: Tab[] = [
  { href: '/plans', label: 'Calendar', icon: 'calendar' },
  { href: '/profile', label: 'Profile', icon: 'account' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-line/70 bg-card/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto max-w-lg grid grid-cols-5 items-center px-2">
        {LEFT.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
        ))}

        {/* Center create FAB */}
        <div className="flex justify-center">
          <Link
            href="/events/new"
            aria-label="Create a plan"
            className="-mt-4 inline-flex size-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-float transition-transform active:scale-95"
          >
            <Icon name="add" size={28} />
          </Link>
        </div>

        {RIGHT.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
        active ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
      }`}
    >
      <Icon name={tab.icon} size={24} className={active ? 'scale-105' : ''} />
      <span>{tab.label}</span>
    </Link>
  );
}
