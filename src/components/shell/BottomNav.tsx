'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Dialog';

type Tab = { href: string; label: string; icon: IconName };
type MoreTab = Tab & {
  desc: string;
  /** Routes represented by this grouped destination. */
  activeHrefs?: readonly string[];
};

const LEFT: Tab[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/discover', label: 'Explore', icon: 'search' },
];

const RIGHT: Tab[] = [{ href: '/plans', label: 'Calendar', icon: 'calendar' }];

/** Everything not on the primary bar, reachable from the More sheet in one tap. */
const MORE: MoreTab[] = [
  { href: '/you', label: 'Your Read', icon: 'sparkle', desc: 'The you your behavior reveals - private' },
  { href: '/people', label: 'People', icon: 'users', desc: 'Add friends, circles, and matchmaking' },
  { href: '/mutual', label: 'Mutual', icon: 'sparkle', desc: 'Down to connect, only if it’s mutual' },
  {
    href: '/map',
    label: 'Around',
    icon: 'globe',
    desc: 'Map, zones, and moments',
    activeHrefs: ['/map', '/zones', '/moments'],
  },
  { href: '/rooms', label: 'Rooms', icon: 'chat', desc: 'Your living-room chats' },
  { href: '/boards', label: 'Boards', icon: 'grid', desc: 'Neighborhood boards' },
  { href: '/profile', label: 'Profile', icon: 'account', desc: 'Your card, socials, and links' },
  { href: '/settings', label: 'Settings', icon: 'settings', desc: 'Notifications, quiet hours, sabbatical' },
  { href: '/features', label: 'Everything', icon: 'grid', desc: 'Every feature, and where to find it' },
];

const MORE_HREFS = MORE.flatMap((tab) => tab.activeHrefs ?? [tab.href]);

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);

  // Close the sheet whenever the route changes (a link was tapped). Adjusting
  // state during render is React's recommended pattern for this, and avoids a
  // cascading-render effect.
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setSheetOpen(false);
  }

  const moreActive = MORE_HREFS.some((href) => isActive(pathname, href));

  return (
    <>
      {sheetOpen && (
        <MoreSheet onClose={() => setSheetOpen(false)} pathname={pathname} />
      )}

      <nav
        aria-label="Main navigation"
        className="chrome-bar fixed bottom-0 inset-x-0 z-40 border-t border-line/70 bg-card/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto max-w-lg grid grid-cols-5 items-center px-2">
          {LEFT.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
          ))}

          {/* Center create FAB */}
          <div className="flex justify-center">
            <Link
              href="/create"
              aria-label="Start something"
              className="-mt-4 inline-flex size-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-float transition-transform active:scale-95"
            >
              <Icon name="add" size={28} />
            </Link>
          </div>

          {RIGHT.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
          ))}

          <button
            type="button"
            aria-label="More"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((open) => !open)}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta rounded-lg ${
              moreActive || sheetOpen ? 'text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Icon name="grid" size={24} className={moreActive ? 'scale-105' : ''} />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function MoreSheet({
  onClose,
  pathname,
}: {
  onClose: () => void;
  pathname: string;
}) {
  return (
    <Sheet
      onClose={onClose}
      labelledBy="more-features-title"
      bottomOnly
      panelClassName="animate-rise max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-card bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-float"
    >
        {/* The grab handle sits centred above the title, where a sheet's
            handle belongs; in the title row it drew as a long bar beside it. */}
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="more-features-title" className="text-base font-extrabold text-ink">
            More
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close more features"
            className="inline-flex size-11 items-center justify-center rounded-full text-ink-faint hover:bg-cream hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MORE.map((tab) => {
            const active = (tab.activeHrefs ?? [tab.href]).some((href) =>
              isActive(pathname, href),
            );
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-start gap-3 rounded-card border p-3 transition-colors ${
                  active
                    ? 'border-terracotta bg-terracotta-soft'
                    : 'border-line bg-card hover:border-ink-faint'
                }`}
              >
                <Icon
                  name={tab.icon}
                  size={22}
                  className={active ? 'text-terracotta-deep' : 'text-ink-soft'}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">{tab.label}</span>
                  <span className="block text-[11px] leading-snug text-ink-faint">
                    {tab.desc}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
    </Sheet>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
        active ? 'text-ink' : 'text-ink-soft hover:text-ink'
      }`}
    >
      <Icon name={tab.icon} size={24} className={active ? 'scale-105' : ''} />
      <span>{tab.label}</span>
    </Link>
  );
}
