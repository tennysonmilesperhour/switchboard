import Link from 'next/link';
import { BottomNav } from './BottomNav';

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
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-paper/90 backdrop-blur-md">
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="size-9 -ml-1 inline-flex items-center justify-center rounded-full text-ink-soft hover:bg-cream"
          >
            ←
          </Link>
        ) : null}
        {title ? (
          <h1 className="font-display text-2xl text-ink flex-1 truncate">{title}</h1>
        ) : (
          <Link href="/" className="font-display text-2xl text-ink flex-1">
            Switchboard
          </Link>
        )}
        {action}
      </header>
      <main className="flex-1 px-4 pb-28 pt-1">{children}</main>
      <BottomNav />
    </div>
  );
}
