import Link from 'next/link';
import { Suspense } from 'react';
import { BottomNav } from './BottomNav';
import { BellPlaceholder, NotificationBell } from './NotificationBell';
import { NotificationNudge } from './NotificationNudge';
import { Icon } from '@/components/ui/Icon';

interface AppShellProps {
  title?: string;
  back?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** Authenticated app chrome: sticky header + bottom tab bar. */
export function AppShell({ title, back, action, children }: AppShellProps) {
  return (
    // `svh` rather than `dvh`: `dvh` re-resolves on every frame of iOS Safari's
    // URL-bar collapse, relaying out the whole column while the two fixed
    // wallpaper layers re-composite beneath it — which is the shaking a page
    // load shows. `svh` is fixed at the small viewport, so the column height
    // stops moving mid-animation.
    <div className="mx-auto max-w-lg min-h-[100svh] flex flex-col">
      <header className="chrome-bar sticky top-0 z-30 flex items-center gap-2 px-4 py-3 bg-paper/85 backdrop-blur-xl">
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="size-9 -ml-1.5 inline-flex items-center justify-center rounded-full text-ink hover:bg-cream"
          >
            <Icon name="back" size={22} />
          </Link>
        ) : null}
        {title ? (
          <h1 className="text-2xl font-extrabold tracking-tight text-ink flex-1 truncate">
            {title}
          </h1>
        ) : (
          <Link
            href="/"
            className="flex-1 text-2xl font-extrabold lowercase tracking-tight text-terracotta-deep"
          >
            switchboard
          </Link>
        )}
        {action ?? (
          // The bell is an async server component that costs two serial round
          // trips. Unsuspended it blocked the whole shell — including every
          // route's `loading.tsx`, which renders this same shell, so the
          // "instant" loading state waited on the database before painting at
          // all. Suspending it lets the shell flush immediately.
          <Suspense fallback={<BellPlaceholder />}>
            <NotificationBell />
          </Suspense>
        )}
      </header>
      <NotificationNudge />
      <main className="flex-1 px-4 pb-28 pt-1">{children}</main>
      <BottomNav />
    </div>
  );
}
