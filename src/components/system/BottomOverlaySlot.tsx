'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type BottomOverlayId = 'install' | 'pmf' | 'notifications';

interface Claim {
  id: BottomOverlayId;
  priority: number;
}

interface BottomOverlayContextValue {
  active: BottomOverlayId | null;
  register: (claim: Claim) => () => void;
}

const BottomOverlayContext = createContext<BottomOverlayContextValue | null>(null);

/** Highest priority wins; ids break ties so selection never depends on effect order. */
export function selectBottomOverlay(claims: Claim[]): BottomOverlayId | null {
  return [...claims]
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0]?.id ?? null;
}

export function BottomOverlayProvider({ children }: { children: React.ReactNode }) {
  const [claims, setClaims] = useState<Partial<Record<BottomOverlayId, number>>>({});

  const register = useCallback(({ id, priority }: Claim) => {
    setClaims((current) => current[id] === priority
      ? current
      : { ...current, [id]: priority });
    return () => {
      setClaims((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    };
  }, []);

  const active = selectBottomOverlay(
    Object.entries(claims).map(([id, priority]) => ({
      id: id as BottomOverlayId,
      priority: priority as number,
    })),
  );
  const value = useMemo(() => ({ active, register }), [active, register]);

  return (
    <BottomOverlayContext.Provider value={value}>
      {children}
    </BottomOverlayContext.Provider>
  );
}

export function useBottomOverlaySlot(
  id: BottomOverlayId,
  wanted: boolean,
  priority: number,
): boolean {
  const context = useContext(BottomOverlayContext);
  if (!context) throw new Error('useBottomOverlaySlot requires BottomOverlayProvider');
  const { active, register } = context;

  useEffect(() => {
    if (!wanted) return;
    return register({ id, priority });
  }, [id, priority, register, wanted]);

  return wanted && active === id;
}
