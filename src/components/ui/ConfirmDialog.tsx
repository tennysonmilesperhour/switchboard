'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/Button';

interface ConfirmOptions {
  title: string;
  body?: string;
  /** Label for the confirming action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Red/destructive styling for the confirm button. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Imperative confirm dialog. Mount once in the root layout; call `useConfirm()`
 * anywhere and `await confirm({...})` to gate a destructive action:
 *
 *   if (await confirm({ title: 'Remove Alex?', danger: true })) remove();
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => settle(false)}
        >
          <div
            className="animate-rise w-full max-w-sm rounded-card bg-card p-5 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold tracking-tight text-ink">
              {options.title}
            </h2>
            {options.body && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {options.body}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => settle(false)}
              >
                Cancel
              </Button>
              <Button
                variant={options.danger ? 'danger' : 'primary'}
                className="flex-1"
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns a function that resolves true if the user confirms. Falls back to
 *  the native confirm() if somehow used outside the provider. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  return async (opts) =>
    typeof window !== 'undefined' ? window.confirm(opts.title) : false;
}
