import Link from 'next/link';
import { BottomNav } from './BottomNav';
import { NotificationBell } from './NotificationBell';
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
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col">
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
            className="flex-1 text-2xl font-extrabold lowercase tracking-tight text-terracotta"
          >
            switchboard
          </Link>
        )}
        {action ?? <NotificationBell />}
      </header>
      <NotificationNudge />
      <main className="flex-1 px-4 pb-28 pt-1">{children}</main>
      <BottomNav />
    </div>
  );
}
