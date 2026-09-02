'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

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
  const titleId = useId();
  const bodyId = useId();

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
        <Dialog
          onClose={() => settle(false)}
          labelledBy={titleId}
          describedBy={options.body ? bodyId : undefined}
          layout="adaptive-sheet"
          panelClassName="animate-rise w-full max-w-sm rounded-card bg-card p-5 shadow-float"
        >
            <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-ink">
              {options.title}
            </h2>
            {options.body && (
              <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {options.body}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                className="min-h-11 flex-1"
                onClick={() => settle(false)}
              >
                Cancel
              </Button>
              <Button
                variant={options.danger ? 'danger' : 'primary'}
                className="min-h-11 flex-1"
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns the app dialog. The provider is a required part of the root shell. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
