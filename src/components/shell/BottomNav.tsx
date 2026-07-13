'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';

type Tab = { href: string; label: string; icon: IconName };

const LEFT: Tab[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/discover', label: 'Explore', icon: 'search' },
];

const RIGHT: Tab[] = [{ href: '/plans', label: 'Calendar', icon: 'calendar' }];

/** Everything not on the primary bar, reachable from the More sheet in one tap. */
const MORE: Array<Tab & { desc: string }> = [
  { href: '/you', label: 'Your Read', icon: 'sparkle', desc: 'The you your behavior reveals — private' },
  { href: '/people', label: 'People', icon: 'users', desc: 'Add friends, circles, and matchmaking' },
  { href: '/mutual', label: 'Mutual', icon: 'sparkle', desc: 'Down to connect, only if it’s mutual' },
  { href: '/moments', label: 'Moments', icon: 'mapPin', desc: 'Who’s around, revealed by consent' },
  { href: '/rooms', label: 'Rooms', icon: 'chat', desc: 'Your living-room chats' },
  { href: '/boards', label: 'Boards', icon: 'grid', desc: 'Neighborhood boards' },
  { href: '/zones', label: 'Zones', icon: 'globe', desc: 'Serendipity at shared places' },
  { href: '/profile', label: 'Profile', icon: 'account', desc: 'Your card, socials, and links' },
  { href: '/settings', label: 'Settings', icon: 'settings', desc: 'Notifications, quiet hours, sabbatical' },
];

const MORE_HREFS = MORE.map((t) => t.href);

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
        className="fixed bottom-0 inset-x-0 z-40 border-t border-line/70 bg-card/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto max-w-lg grid grid-cols-5 items-center px-2">
          {LEFT.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
          ))}

          {/* Center create FAB */}
          <div className="flex justify-center">
            <Link
              href="/create"
              aria-label="Create a plan"
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
              moreActive || sheetOpen ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
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
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus into the sheet on open and close on Escape, so keyboard and
    // assistive-technology users can operate and dismiss it.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 bg-ink/30"
      role="dialog"
      aria-modal="true"
      aria-label="More features"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="animate-rise absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-card bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="grid grid-cols-2 gap-2">
          {MORE.map((tab) => {
            const active = isActive(pathname, tab.href);
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
      </div>
    </div>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
        active ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
      }`}
    >
      <Icon name={tab.icon} size={24} className={active ? 'scale-105' : ''} />
      <span>{tab.label}</span>
    </Link>
  );
}
