import { createContext, useContext, type ReactNode } from 'react';

/*
 * Stand-in for `next/navigation`, used only inside the design-sync bundle.
 *
 * BottomNav reads the current route with `usePathname()` to decide which tab
 * is active. Outside Next.js there is no router, so the bundle resolves
 * `next/navigation` here (see ../tsconfig.paths.json) and the pathname comes
 * from a React context instead. The app itself never loads this file.
 */

const PathnameContext = createContext<string>('/');

/** The current route, as BottomNav sees it. Defaults to "/" (Home). */
export function usePathname(): string {
  return useContext(PathnameContext);
}

interface PathnameProviderProps {
  /** The route to treat as current, for example "/plans" or "/discover". */
  pathname: string;
  children: ReactNode;
}

/**
 * Sets the route BottomNav treats as current. Wrap a screen in it to light up
 * the matching tab: "/" is Home, "/discover" is Explore, "/plans" is Calendar,
 * and any More-sheet route (such as "/people" or "/settings") lights up More.
 * Without it BottomNav shows Home as active.
 */
export function PathnameProvider({ pathname, children }: PathnameProviderProps) {
  return <PathnameContext.Provider value={pathname}>{children}</PathnameContext.Provider>;
}
